import { useState, useEffect, useCallback, useRef } from 'react'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { getMedicines, createSale, getSalesHistory } from '../../services/api'
import GlassCard from '../ui/GlassCard'
import Spinner from '../ui/Spinner'
import Badge from '../ui/Badge'

export default function BillingPanel() {
  const { showToast, prefilledMedicine, setPrefilledMedicine } = useWorkspace()

  // Autocomplete medicines select state
  const [medicines, setMedicines] = useState([])
  const [filteredMedicines, setFilteredMedicines] = useState([])
  const [selectedMedicine, setSelectedMedicine] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const dropdownRef = useRef(null)

  // Current inputs
  const [quantityToAdd, setQuantityToAdd] = useState('1')
  const [priceToAdd, setPriceToAdd] = useState('')

  // Cart: Array of { medicine_id, name, batch_number, available_stock, quantity_sold, sale_price }
  const [cart, setCart] = useState([])

  // Form checkout details
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState(null)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')

  // Sales History Logs
  const [salesHistory, setSalesHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Fetch medicines and log transactions
  const loadMedicinesList = async () => {
    try {
      const data = await getMedicines()
      setMedicines(data || [])
    } catch (err) {
      console.error('Failed to load medicines:', err)
    }
  }

  const loadHistoryData = useCallback(async () => {
    setLoadingHistory(true)
    try {
      const data = await getSalesHistory({
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      })
      setSalesHistory(data || [])
    } catch (err) {
      console.error('Failed to load sales history:', err)
    } finally {
      setLoadingHistory(false)
    }
  }, [startDate, endDate])

  useEffect(() => {
    loadMedicinesList()
    loadHistoryData()
  }, [loadHistoryData])

  // Click outside to close dropdown search list
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsSearchFocused(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Filter autocomplete list matches
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredMedicines(medicines.filter((m) => m.quantity > 0)) // only suggest instock
      return
    }

    const term = searchTerm.toLowerCase().trim()
    const matches = medicines.filter((m) => 
      m.name.toLowerCase().includes(term) || 
      (m.batch_number && m.batch_number.toLowerCase().includes(term))
    )
    setFilteredMedicines(matches)
  }, [searchTerm, medicines])

  const handleSelectMedicine = (med) => {
    setSelectedMedicine(med)
    setSearchTerm(`${med.name} (Batch: ${med.batch_number || 'N/A'}, Stock: ${med.quantity})`)
    setPriceToAdd(med.mrp ? parseFloat(med.mrp).toString() : '')
    setQuantityToAdd('1')
    setFormError(null)
    setIsSearchFocused(false)
  }

  // Handle prefilled medicine from QR scanner redirect
  useEffect(() => {
    if (prefilledMedicine && medicines.length > 0) {
      const found = medicines.find((m) => m.id === prefilledMedicine.id)
      if (found) {
        handleSelectMedicine(found)
      } else {
        handleSelectMedicine(prefilledMedicine)
      }
      setPrefilledMedicine(null) // clear immediately
    }
  }, [prefilledMedicine, medicines, setPrefilledMedicine])

  // Add Item to Cart
  const handleAddToCart = (e) => {
    e.preventDefault()
    if (!selectedMedicine) {
      setFormError('Please select a medicine to add.')
      return
    }

    const qty = parseInt(quantityToAdd) || 0
    const price = parseFloat(priceToAdd) || 0.0

    if (qty <= 0) {
      setFormError('Quantity must be a positive integer.')
      return
    }
    if (price < 0) {
      setFormError('Price cannot be negative.')
      return
    }

    // Check duplicate in cart
    const existingIndex = cart.findIndex((item) => item.medicine_id === selectedMedicine.id)
    if (existingIndex > -1) {
      const updatedCart = [...cart]
      const newQty = updatedCart[existingIndex].quantity_sold + qty
      if (newQty > selectedMedicine.quantity) {
        setFormError(`Insufficient stock. Only ${selectedMedicine.quantity} available, but cart would total ${newQty}.`)
        return
      }
      updatedCart[existingIndex].quantity_sold = newQty
      updatedCart[existingIndex].sale_price = price
      setCart(updatedCart)
    } else {
      if (qty > selectedMedicine.quantity) {
        setFormError(`Insufficient stock. Only ${selectedMedicine.quantity} available.`)
        return
      }
      setCart([
        ...cart,
        {
          medicine_id: selectedMedicine.id,
          name: selectedMedicine.name,
          batch_number: selectedMedicine.batch_number,
          available_stock: selectedMedicine.quantity,
          quantity_sold: qty,
          sale_price: price
        }
      ])
    }

    // reset select inputs
    setSelectedMedicine(null)
    setSearchTerm('')
    setQuantityToAdd('1')
    setPriceToAdd('')
    setFormError(null)
    showToast('Item added to POS checkout cart', 'success')
  }

  const handleUpdateCartItem = (index, field, value) => {
    const updatedCart = [...cart]
    if (field === 'quantity_sold') {
      updatedCart[index].quantity_sold = parseInt(value) || 0
    } else if (field === 'sale_price') {
      updatedCart[index].sale_price = parseFloat(value) || 0.0
    }
    setCart(updatedCart)
    setFormError(null)
  }

  const handleRemoveFromCart = (index) => {
    const name = cart[index].name
    setCart((prev) => prev.filter((_, i) => i !== index))
    showToast(`Removed "${name}" from cart`, 'info')
  }

  const grandTotal = cart.reduce((sum, item) => sum + (item.quantity_sold * item.sale_price), 0.0)

  const cartErrors = cart.map((item) => {
    if (item.quantity_sold <= 0) return `Quantity for '${item.name}' must be positive.`
    if (item.quantity_sold > item.available_stock) return `Insufficient stock for '${item.name}' (Stock: ${item.available_stock}).`
    if (item.sale_price < 0) return `Price for '${item.name}' cannot be negative.`
    return null
  }).filter(Boolean)

  const isCartValid = cart.length > 0 && cartErrors.length === 0

  // Submit checkout
  const handleSubmitCheckout = async (e) => {
    e.preventDefault()
    if (cart.length === 0) {
      setFormError('Checkout cart is empty.')
      return
    }
    if (cartErrors.length > 0) {
      setFormError(cartErrors[0])
      return
    }

    if (customerPhone.trim()) {
      const cleaned = customerPhone.replace(/[ \-+\(\)]/g, '')
      if (!/^\d+$/.test(cleaned) || cleaned.length < 7 || cleaned.length > 15) {
        setFormError('Phone number must contain between 7 and 15 digits.')
        return
      }
    }

    setIsSubmitting(true)
    setFormError(null)

    try {
      const payload = {
        customer_name: customerName.trim() || null,
        customer_phone: customerPhone.trim() || null,
        items: cart.map((item) => ({
          medicine_id: item.medicine_id,
          quantity_sold: item.quantity_sold,
          sale_price: item.sale_price
        }))
      }

      const res = await createSale(payload)
      showToast(`Sale recorded! Grand Total: ₹${grandTotal.toFixed(2)}`, 'success')
      
      // Auto print thermal invoice receipt
      handlePrintReceipt(res)

      // Reset
      setCart([])
      setCustomerName('')
      setCustomerPhone('')

      await loadMedicinesList()
      await loadHistoryData()
    } catch (err) {
      setFormError(err.message || 'Failed to record sales checkout.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Thermal receipt print handler (identical popup code)
  const handlePrintReceipt = (sale) => {
    const printWindow = window.open('', '_blank', 'width=600,height=600')
    if (!printWindow) {
      alert('Pop-up blocked. Please allow pop-ups for this site to print receipts.')
      return
    }

    const formattedDate = new Date(sale.sold_at).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })

    const itemsHtml = sale.items.map((item) => `
      <tr>
        <td style="padding: 6px 0;">${item.medicine_name}</td>
        <td class="text-right font-mono" style="padding: 6px 0;">${item.quantity_sold}</td>
        <td class="text-right font-mono" style="padding: 6px 0;">₹${parseFloat(item.sale_price).toFixed(2)}</td>
        <td class="text-right font-mono" style="padding: 6px 0;">₹${parseFloat(item.line_total).toFixed(2)}</td>
      </tr>
    `).join('')

    printWindow.document.write(`
      <html>
        <head>
          <title>Invoice #${sale.id} - Receipt</title>
          <style>
            body {
              font-family: 'Courier New', Courier, monospace;
              padding: 20px;
              color: #111;
              background-color: #fff;
              max-width: 450px;
              margin: 0 auto;
              font-size: 14px;
              line-height: 1.4;
            }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .header { margin-bottom: 15px; }
            .title { font-size: 20px; font-weight: bold; text-transform: uppercase; margin-bottom: 2px; }
            .subtitle { font-size: 12px; color: #555; }
            .separator { border-top: 1px dashed #000; margin: 10px 0; }
            .details-table { width: 100%; border-collapse: collapse; margin-top: 5px; }
            .details-table th { border-bottom: 1px dashed #000; padding: 4px 0; text-align: left; font-size: 12px; }
            .details-table td { vertical-align: top; }
            .summary { margin-top: 10px; font-size: 15px; font-weight: bold; }
            .footer { font-size: 11px; margin-top: 25px; color: #555; text-align: center; }
          </style>
        </head>
        <body>
          <div class="header text-center">
            <div class="title">MediVision AI</div>
            <div class="subtitle">Smart Pharmacy operating system</div>
            <div class="subtitle">Invoice / Sale Receipt</div>
          </div>
          
          <div class="separator"></div>
          
          <div><strong>Bill No   :</strong> MV-${String(sale.id).padStart(5, '0')}</div>
          <div><strong>Date      :</strong> ${formattedDate}</div>
          <div><strong>Sold By   :</strong> ${sale.sold_by || 'Cashier'}</div>
          ${sale.customer_name ? `<div><strong>Customer  :</strong> ${sale.customer_name}</div>` : ''}
          
          <div class="separator"></div>
          
          <table class="details-table">
            <thead>
              <tr>
                <th>Description</th>
                <th class="text-right" style="width: 50px;">Qty</th>
                <th class="text-right" style="width: 80px;">Price</th>
                <th class="text-right" style="width: 80px;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
          
          <div class="separator"></div>
          
          <div class="summary text-right">
            Grand Total: ₹${parseFloat(sale.total_amount).toFixed(2)}
          </div>
          
          <div class="separator"></div>
          
          <div class="footer">
            Thank you for shopping with us!<br>
            Powered by MediVision AI
          </div>
          
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            }
          </script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  return (
    <div className="panel-enter flex flex-col gap-6 font-sans">
      
      <div className="panel-header">
        <div>
          <h2 className="panel-title flex items-center gap-2">
            <span>💳</span> Apple POS Terminal
          </h2>
          <p className="panel-subtitle">Draft billing sales records with automated spooler thermal logs</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        
        {/* Left Autocomplete panel (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <GlassCard className="p-5 flex flex-col gap-4 flex-grow justify-between">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 pb-2 border-b border-slate-900 mb-3">
                Item Selector Console
              </h3>

              <form onSubmit={handleAddToCart} className="flex flex-col gap-4 text-xs font-semibold">
                {/* Autocomplete box */}
                <div className="relative" ref={dropdownRef}>
                  <label className="block text-[9px] font-bold uppercase text-slate-550 mb-1">
                    Lookup Pharmacy Catalog
                  </label>
                  <input
                    type="text"
                    placeholder="Search medicine name..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value)
                      if (selectedMedicine) {
                        setSelectedMedicine(null)
                        setPriceToAdd('')
                        setQuantityToAdd('1')
                      }
                      setIsSearchFocused(true)
                    }}
                    onFocus={() => setIsSearchFocused(true)}
                    className="input-base py-1.5"
                  />

                  {isSearchFocused && filteredMedicines.length > 0 && (
                    <ul className="billing-dropdown-menu">
                      {filteredMedicines.map((med) => (
                        <li
                          key={med.id}
                          onClick={() => handleSelectMedicine(med)}
                          className="billing-dropdown-item"
                        >
                          <div className="min-w-0">
                            <strong className="text-slate-200 block text-xs truncate max-w-[150px]">{med.name}</strong>
                            <span className="text-[9px] text-slate-500 font-mono mt-0.5">Batch: {med.batch_number || 'N/A'}</span>
                          </div>
                          <span className="bg-primary/15 text-primary border border-primary/20 px-1.5 py-0.5 rounded font-mono text-[9px] font-bold">
                            Qty: {med.quantity}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Quantity */}
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold uppercase text-slate-550">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    disabled={!selectedMedicine}
                    value={quantityToAdd}
                    onChange={(e) => setQuantityToAdd(e.target.value)}
                    className="input-base py-1.5 font-bold font-mono"
                  />
                  {selectedMedicine && (
                    <div className="flex justify-between text-[9px] text-slate-500 font-semibold mt-1">
                      <span>Available stock:</span>
                      <span className="font-mono">{selectedMedicine.quantity} units</span>
                    </div>
                  )}
                </div>

                {/* Locked Price info */}
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold uppercase text-slate-550">Price (Locked MRP)</label>
                  <div className="input-base py-1.5 text-xs font-bold font-mono text-slate-450 bg-surface-950/60 min-h-[34px] flex items-center">
                    {priceToAdd ? `₹${parseFloat(priceToAdd).toFixed(2)}` : '—'}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!selectedMedicine}
                  className="btn-primary w-full py-2.5 mt-2 text-xs font-bold uppercase tracking-wider disabled:opacity-40"
                >
                  ➕ Add to POS Cart
                </button>
              </form>
            </div>
          </GlassCard>
        </div>

        {/* Right Cart Overview Panel (8 cols) */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          <GlassCard className="p-5 flex flex-col justify-between flex-1 h-full">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 pb-2 border-b border-slate-900 mb-3">
                POS Cart Summary
              </h3>

              {formError && (
                <div className="alert alert-danger py-2 text-xs leading-normal mt-2">
                  <span>⚠</span>
                  <span>{formError}</span>
                </div>
              )}

              {/* Items scroll */}
              <div className="overflow-x-auto min-h-[160px] max-h-[220px] overflow-y-auto mt-2">
                {cart.length > 0 ? (
                  <table className="mv-table text-xs">
                    <thead>
                      <tr>
                        <th>Medicine</th>
                        <th>Batch</th>
                        <th className="text-center" style={{ width: '90px' }}>Qty</th>
                        <th className="text-right" style={{ width: '90px' }}>Price</th>
                        <th className="text-right" style={{ width: '90px' }}>Total</th>
                        <th className="text-center" style={{ width: '60px' }}>Remove</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cart.map((item, idx) => {
                        const isOutOfStock = item.quantity_sold > item.available_stock
                        return (
                          <tr key={item.medicine_id}>
                            <td className="font-bold text-slate-200 truncate max-w-[120px]">{item.name}</td>
                            <td className="font-mono text-slate-500 text-[10px]">{item.batch_number || '—'}</td>
                            <td className="text-center">
                              <input
                                type="number"
                                min="1"
                                value={item.quantity_sold}
                                onChange={(e) => handleUpdateCartItem(idx, 'quantity_sold', e.target.value)}
                                className={`w-16 bg-surface-950 border rounded-lg px-2 py-0.5 text-center font-bold font-mono text-xs ${
                                  isOutOfStock ? 'border-rose-500 text-rose-450' : 'border-slate-800'
                                }`}
                              />
                            </td>
                            <td className="text-right font-mono font-semibold text-slate-400">₹{item.sale_price.toFixed(2)}</td>
                            <td className="text-right font-mono font-bold text-slate-200">₹{(item.quantity_sold * item.sale_price).toFixed(2)}</td>
                            <td className="text-center">
                              <button onClick={() => handleRemoveFromCart(idx)} className="text-slate-500 hover:text-rose-500 font-bold bg-transparent border-none text-sm cursor-pointer">
                                🗑
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                ) : (
                  <div className="text-center py-12 border border-dashed border-slate-900 rounded-xl text-slate-500">
                    <span className="text-2xl block mb-1 select-none">🛒</span>
                    <p className="font-semibold text-slate-400 text-xs">POS cart is empty</p>
                  </div>
                )}
              </div>
            </div>

            {/* Customer Inputs */}
            <div>
              <div className="border-t border-slate-900 pt-4 mt-4 grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold uppercase text-slate-550 tracking-wider">Customer Name</label>
                  <input
                    type="text"
                    placeholder="e.g. John Doe"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="input-base py-1.5"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold uppercase text-slate-550 tracking-wider">Phone number</label>
                  <input
                    type="text"
                    placeholder="e.g. 9876543210"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="input-base py-1.5"
                  />
                </div>
              </div>

              {/* Checkout panel footer */}
              <div className="border-t border-slate-900 pt-4 mt-4 flex items-center justify-between gap-4">
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold uppercase text-slate-500">Grand Total</span>
                  <span className="text-lg font-black text-emerald-400 font-mono">₹{grandTotal.toFixed(2)}</span>
                </div>

                <button
                  onClick={handleSubmitCheckout}
                  disabled={isSubmitting || !isCartValid}
                  className="btn-primary py-2.5 px-6 text-xs uppercase tracking-wider font-extrabold"
                >
                  {isSubmitting ? 'Recording Checkout…' : 'Submit &amp; Print Bill'}
                </button>
              </div>
            </div>
          </GlassCard>
        </div>
      </div>

      {/* History Ledger list below */}
      <GlassCard className="p-5 mt-4 flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-slate-900 pb-3">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Transaction History Log</h3>
          </div>
          <span className="text-[9px] font-mono font-bold text-slate-400 bg-surface-950 border border-slate-900 px-3 py-1.5 rounded-xl select-none">
            Total sales logged: {salesHistory.length}
          </span>
        </div>

        {/* Date Filters */}
        <div className="flex flex-wrap gap-4 items-center mb-2 text-xs font-semibold">
          <div className="flex items-center gap-2">
            <label className="text-[9px] font-bold text-slate-500 uppercase">Start Date:</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="input-base py-1 px-2 text-xs font-mono font-bold w-36"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[9px] font-bold text-slate-500 uppercase">End Date:</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="input-base py-1 px-2 text-xs font-mono font-bold w-36"
            />
          </div>
          {(startDate || endDate) && (
            <button onClick={() => { setStartDate(''); setEndDate(''); }} className="btn-ghost py-1 px-3 text-xs">
              Clear
            </button>
          )}
        </div>

        {/* Sales Table list */}
        <div className="overflow-x-auto">
          {loadingHistory ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-500 text-xs font-bold animate-pulse font-mono">
              <Spinner size="sm" className="border-t-primary" />
              <span>LOGGING BILLS...</span>
            </div>
          ) : salesHistory.length > 0 ? (
            <table className="mv-table text-xs">
              <thead>
                <tr>
                  <th>Receipt ID</th>
                  <th>Checkout Products</th>
                  <th className="text-right">Total Amount</th>
                  <th>Date &amp; Time</th>
                  <th>Cashier</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {salesHistory.map((sale) => (
                  <tr key={sale.id}>
                    <td className="font-mono text-xs font-bold text-slate-400">
                      MV-${String(sale.id).padStart(5, '0')}
                      {(sale.customer_name || sale.customer_phone) && (
                        <div className="text-[9px] text-slate-500 font-sans font-semibold mt-1">
                          {sale.customer_name && <div className="text-slate-400">👤 {sale.customer_name}</div>}
                          {sale.customer_phone && <div className="text-slate-450 font-mono">📞 {sale.customer_phone}</div>}
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="flex flex-col gap-1 max-w-[300px]">
                        {sale.items.map((item) => (
                          <div key={item.id} className="text-slate-300 text-xs font-semibold">
                            {item.medicine_name} <span className="text-slate-500 font-mono font-bold text-[9px]">(x{item.quantity_sold} @ ₹{parseFloat(item.sale_price).toFixed(2)})</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="text-right font-mono font-bold text-emerald-400">
                      ₹{parseFloat(sale.total_amount).toFixed(2)}
                    </td>
                    <td className="text-slate-400 font-mono text-xs">
                      {new Date(sale.sold_at).toLocaleString()}
                    </td>
                    <td className="text-slate-400 font-semibold text-xs">
                      {sale.sold_by || '—'}
                    </td>
                    <td className="text-right">
                      <button
                        onClick={() => handlePrintReceipt(sale)}
                        className="btn-ghost py-1 px-2.5 text-[10px] font-bold border-accent/20 text-accent hover:bg-accent-glow"
                      >
                        🖨️ Print Bill
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-12 border border-dashed border-slate-900 rounded-xl text-slate-500">
              <span className="text-2xl block mb-1">📋</span>
              <p className="font-semibold text-slate-400 text-xs">No sales registered yet</p>
            </div>
          )}
        </div>
      </GlassCard>

    </div>
  )
}
