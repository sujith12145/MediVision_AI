import React, { createContext, useContext, useEffect, useRef } from 'react'
import { useWorkspace } from './WorkspaceContext'
import { supabase } from '../services/supabase'

const NotificationContext = createContext(null)

export function NotificationProvider({ children }) {
  const { showToast, addTask, setNotifications } = useWorkspace()
  const socketRef = useRef(null)

  useEffect(() => {
    // Request permission for native system notifications
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission()
      }
    }
  }, [])

  useEffect(() => {
    let active = true
    let reconnectTimeout = null

    const connect = async () => {
      try {
        const { data } = await supabase.auth.getSession()
        const token = data?.session?.access_token
        if (!token) {
          // User not logged in, check again in 5s
          if (active) reconnectTimeout = setTimeout(connect, 5000)
          return
        }

        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        // Determine backend WebSocket host
        const wsHost = import.meta.env.VITE_API_URL
          ? import.meta.env.VITE_API_URL.replace(/^http/, 'ws')
          : (window.location.host === 'localhost:5173'
              ? 'ws://localhost:8000'
              : `${wsProtocol}//${window.location.host}`)

        const socketUrl = `${wsHost}/api/voice/notifications?token=${token}`
        const ws = new WebSocket(socketUrl)
        socketRef.current = ws

        ws.onopen = () => {
          console.log('Registered background notifications WebSocket connection.')
        }

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            console.log('Received notification event:', data)

            let title = 'MediVision AI Alert'
            let body = ''
            let severity = 'info'

            if (data.type === 'trigger_reminder') {
              title = 'Inventory Alert'
              body = data.text || `Stock alert for ${data.medicine_name || 'medicine'}`
              severity = 'warning'

              // 1. Toast Alert
              showToast(body, severity)

              // 2. Add to Workspace Notification Drawer
              if (setNotifications) {
                setNotifications(prev => [
                  {
                    id: Date.now(),
                    type: 'danger',
                    category: 'Inventory',
                    title: 'Reminder Due',
                    message: body,
                    time: 'Just now',
                    unread: true
                  },
                  ...prev
                ])
              }
            } else if (data.type === 'reminder_resolved') {
              title = 'Reminder Resolved'
              body = data.message || 'Issue resolved.'
              severity = 'success'

              showToast(body, severity)

              if (setNotifications) {
                setNotifications(prev => [
                  {
                    id: Date.now(),
                    type: 'success',
                    category: 'Inventory',
                    title: 'Alert Resolved',
                    message: body,
                    time: 'Just now',
                    unread: false
                  },
                  ...prev
                ])
              }
            } else if (data.type === 'task_dispatched') {
              title = 'New Task Dispatched'
              body = data.task_text || 'New staff task assigned'
              severity = 'info'

              showToast(body, severity)

              // Add task to Workspace checklist
              if (addTask) {
                addTask(body)
              }
            }

            // 3. Browser native Notification if tab is hidden
            if (document.visibilityState === 'hidden' && Notification.permission === 'granted') {
              new Notification(title, {
                body: body,
                icon: '/icon-192.png'
              })
            }
          } catch (err) {
            console.error('Failed to parse notification JSON:', err)
          }
        }

        ws.onclose = () => {
          console.log('Notifications WebSocket closed. Reconnecting...')
          if (active) reconnectTimeout = setTimeout(connect, 5000)
        }

        ws.onerror = (err) => {
          console.error('Notifications WebSocket error:', err)
          ws.close()
        }

      } catch (err) {
        console.error('Error in Notification Connection:', err)
        if (active) reconnectTimeout = setTimeout(connect, 5000)
      }
    }

    connect()

    return () => {
      active = false
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      if (socketRef.current) {
        socketRef.current.close()
      }
    }
  }, [showToast, addTask, setNotifications])

  return (
    <NotificationContext.Provider value={{ socket: socketRef.current }}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  return useContext(NotificationContext)
}
