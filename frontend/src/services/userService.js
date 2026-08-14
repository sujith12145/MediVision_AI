import { supabase } from '../lib/supabaseClient'

export const userService = {
  async getAllUsers() {
    const { data, error } = await supabase
      .from('user_roles')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  },

  async addUser(email, role, assignedBy) {
    const { data, error } = await supabase
      .from('user_roles')
      .insert([{ email, role, assigned_by: assignedBy }])
      .select()
    if (error) throw error
    return data[0]
  },

  async updateUser(id, role) {
    const { data, error } = await supabase
      .from('user_roles')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
    if (error) throw error
    return data[0]
  },

  async deleteUser(id) {
    const { error } = await supabase
      .from('user_roles')
      .delete()
      .eq('id', id)
    if (error) throw error
  },
}
