import { useState, useEffect, useCallback, useRef } from 'react'
import { getMedicines, createSale, getSalesHistory } from '../services/api'

export default function BillingAndSales({ onSaleSuccess, prefilledMedicine, clearPrefilledMedicine }) {
  // Medicines select state
  const [medicines, setMedicines] = useState([])
  const [filteredMedicines, setFilteredMedicines] = useState([])
  const [selectedMedicine, setSelectedMedicine] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const dropdownRef = useRef(null)

  // Current Add-Item inputs
  const [quantityToAdd, setQuantityToAdd] = useState('1')
  const [priceToAdd, setPriceToAdd] = useState('')

  // Cart state: array of { medicine_id, name, batch_number, available_stock, quantity_sold, sale_price }
  const [cart, setCart] = useState([])

  // Form submit state
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState(null)
  const [formSuccess, setFormSuccess] = useState(null)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')

  // Sales History state
  const [salesHistory, setSalesHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // 1. Fetch medicines for selection and load initial history on mount
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

  // Click outside listener to close search dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsSearchFocused(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // 2. Filter medicines based on search term
  useEffect(() => {
    if (!searchTerm.strip?.() && searchTerm === '') {
      setFilteredMedicines(medicines.filter(m => m.quantity > 0)) // Only suggest in-stock by default
      return
    }

    const term = searchTerm.toLowerCase().trim()
    const matches = medicines.filter((m) => 
      m.name.toLowerCase().includes(term) || 
      (m.batch_number && m.batch_number.toLowerCase().includes(term))
    )
    setFilteredMedicines(matches)
  }, [searchTerm, medicines])

  // 3. Handle Select Medicine
  const handleSelectMedicine = (med) => {
    setSelectedMedicine(med)
    setSearchTerm(`${med.name} (Batch: ${med.batch_number || 'N/A'}, Stock: ${med.quantity})`)
    setPriceToAdd(med.mrp ? parseFloat(med.mrp).toString() : '')
    setQuantityToAdd('1')
    setFormError(null)
    setIsSearchFocused(false)
  }

  // 3b. Handle prefilled medicine from QR code scan
  useEffect(() => {
    if (prefilledMedicine && medicines.length > 0) {
      const found = medicines.find(m => m.id === prefilledMedicine.id)
      if (found) {
        handleSelectMedicine(found)
      } else {
        handleSelectMedicine(prefilledMedicine)
      }
      if (clearPrefilledMedicine) {
        clearPrefilledMedicine()
      }
    }
  }, [prefilledMedicine, medicines, clearPrefilledMedicine])

  // 4. Add Selected Item to Cart
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
      setFormError('Sale price cannot be negative.')
      return
    }

    // Check if item already exists in cart
    const existingIndex = cart.findIndex(item => item.medicine_id === selectedMedicine.id)
    if (existingIndex > -1) {
      // Update quantity on existing cart item
      const updatedCart = [...cart]
      const newQty = updatedCart[existingIndex].quantity_sold + qty
      
      if (newQty > selectedMedicine.quantity) {
        setFormError(`Cannot add quantity. Available stock is ${selectedMedicine.quantity} units, but cart would total ${newQty} units.`);
        return
      }

      updatedCart[existingIndex].quantity_sold = newQty
      // Keep price updated to latest entry
      updatedCart[existingIndex].sale_price = price
      setCart(updatedCart)
    } else {
      // Add new cart item
      if (qty > selectedMedicine.quantity) {
        setFormError(`Cannot add quantity. Available stock is only ${selectedMedicine.quantity} units.`);
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

    // Reset select inputs
    setSelectedMedicine(null)
    setSearchTerm('')
    setQuantityToAdd('1')
    setPriceToAdd('')
    setFormError(null)
  }

  // 5. Update cart item inline
  const handleUpdateCartItem = (index, field, value) => {
    const updatedCart = [...cart]
    if (field === 'quantity_sold') {
      const val = parseInt(value) || 0
      updatedCart[index].quantity_sold = val
    } else if (field === 'sale_price') {
      const val = parseFloat(value) || 0.0
      updatedCart[index].sale_price = val
    }
    setCart(updatedCart)
    setFormError(null)
  }

  // 6. Remove item from cart
  const handleRemoveFromCart = (index) => {
    const updatedCart = cart.filter((_, i) => i !== index)
    setCart(updatedCart)
    setFormError(null)
  }

  // 7. Calculate Grand Total
  const grandTotal = cart.reduce((sum, item) => sum + (item.quantity_sold * item.sale_price), 0.0)

  // 8. Live warnings for cart
  const cartErrors = cart.map(item => {
    if (item.quantity_sold <= 0) return `Quantity for '${item.name}' must be positive.`
    if (item.quantity_sold > item.available_stock) return `insufficient stock for '${item.name}' (Requested: ${item.quantity_sold}, Stock: ${item.available_stock}).`
    if (item.sale_price < 0) return `Price for '${item.name}' cannot be negative.`
    return null
  }).filter(Boolean)

  const isCartValid = cart.length > 0 && cartErrors.length === 0

  // 9. Handle Submit checkout
  const handleSubmitCheckout = async (e) => {
    e.preventDefault()
    if (cart.length === 0) {
      setFormError('Your cart is empty.')
      return
    }
    if (cartErrors.length > 0) {
      setFormError(cartErrors[0])
      return
    }

    if (customerPhone.trim()) {
      const cleaned = customerPhone.replace(/[ \-+\(\)]/g, '')
      if (!/^\d+$/.test(cleaned) || cleaned.length < 7 || cleaned.length > 15) {
        setFormError('Customer phone must contain only digits and be between 7 and 15 digits long.')
        return
      }
    }

    setIsSubmitting(true)
    setFormError(null)
    setFormSuccess(null)

    try {
      const payload = {
        customer_name: customerName.trim() || null,
        customer_phone: customerPhone.trim() || null,
        items: cart.map(item => ({
          medicine_id: item.medicine_id,
          quantity_sold: item.quantity_sold,
          sale_price: item.sale_price
        }))
      }

      const res = await createSale(payload)
      setFormSuccess(`Sale recorded successfully! Grand Total: ₹${grandTotal.toFixed(2)}`)
      
      // Auto-trigger printing of receipt
      handlePrintReceipt(res)

      // Reset cart and customer form fields
      setCart([])
      setCustomerName('')
      setCustomerPhone('')

      // Reload dropdown medicine list and history logs
      await loadMedicinesList()
      await loadHistoryData()

      // Notify parent to refresh inventory lists
      if (onSaleSuccess) {
        onSaleSuccess()
      }
    } catch (err) {
      setFormError(err.message || 'Failed to record multi-item sale.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // 10. Clear filters helper
  const handleClearFilters = () => {
    setStartDate('')
    setEndDate('')
  }

  // 11. Print thermal receipt
  const handlePrintReceipt = (sale) => {
    const printWindow = window.open('', '_blank', 'width=600,height=600')
    if (!printWindow) {
      alert('Pop-up blocked. Please allow pop-ups for this site to print bills.')
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

    const itemsHtml = sale.items.map(item => `
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
          <title>Receipt #${sale.id} - MediVision AI</title>
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
            <div class="subtitle">Smart Pharmacy Management System</div>
            <div class="subtitle">Invoice / Bill Receipt</div>
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
            Please keep this receipt for your records.<br>
            Powered by MediVision AI
          </div>
          
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() {
                window.close();
              }, 500);
            }
          </script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  return (
    <div className="flex flex-col gap-8 animate-fade-in">
      {/* Upper Grid: Add Item Form & Cart Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Side: Select Item Form Panel */}
        <div className="lg:col-span-4 border border-slate-800/80 bg-surface-800/20 backdrop-blur-md rounded-3xl p-6 flex flex-col gap-4">
          <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <span>🔍</span> Select Medicine
          </h3>
          <p className="text-slate-400 text-xs leading-relaxed">
            Search for medicines currently in stock and specify quantities/pricing to load them into the multi-item checkout cart.
          </p>

          <form onSubmit={handleAddToCart} className="flex flex-col gap-4 mt-2">
            {/* Search Autocomplete */}
            <div className="relative" ref={dropdownRef}>
              <label className="block text-[11px] font-bold uppercase text-slate-500 tracking-wider mb-1.5">
                Search Inventory
              </label>
              <input
                type="text"
                placeholder="Type name or batch..."
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
                className="w-full bg-surface-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-650 focus:outline-none focus:border-primary-500/80 transition-all font-semibold"
              />
              
              {/* Dropdown list */}
              {isSearchFocused && filteredMedicines.length > 0 && (
                <ul className="absolute z-50 w-full mt-1 max-h-48 overflow-y-auto bg-surface-850 border border-slate-800 rounded-xl shadow-2xl divide-y divide-slate-800/60 backdrop-blur-md">
                  {filteredMedicines.map((med) => (
                    <li
                      key={med.id}
                      onClick={() => handleSelectMedicine(med)}
                      className="px-3 py-2 hover:bg-surface-800 text-[11px] font-medium text-slate-350 hover:text-slate-100 cursor-pointer flex justify-between items-center"
                    >
                      <div>
                        <strong className="text-slate-200 block text-xs">{med.name}</strong>
                        <span className="text-[9px] text-slate-550">Batch: {med.batch_number || 'N/A'}</span>
                      </div>
                      <div className="text-right">
                        <span className="px-1.5 py-0.5 rounded bg-primary-500/10 text-primary-400 font-mono text-[9px]">
                          Stock: {med.quantity}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Quantity input */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 tracking-wider mb-1.5">
                Quantity to Add
              </label>
              <input
                type="number"
                min="1"
                step="1"
                disabled={!selectedMedicine}
                value={quantityToAdd}
                onChange={(e) => setQuantityToAdd(e.target.value)}
                className="w-full bg-surface-900 border border-slate-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-primary-500/80 transition-all font-bold font-mono"
              />
              {selectedMedicine && (
                <div className="mt-1 flex justify-between text-[10px] font-semibold text-slate-500">
                  <span>Available stock:</span>
                  <span className="text-slate-350">{selectedMedicine.quantity} units</span>
                </div>
              )}
            </div>

            {/* Price display (Locked to MRP) */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 tracking-wider mb-1.5">
                Sale Price / Unit (Locked to MRP)
              </label>
              <div className="w-full bg-surface-900/50 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-400 font-bold font-mono min-h-[36px] flex items-center">
                {priceToAdd ? `₹${parseFloat(priceToAdd).toFixed(2)}` : '—'}
              </div>
            </div>


            <button
              type="submit"
              disabled={!selectedMedicine}
              className="mt-2 w-full bg-surface-900 border border-primary-500/20 disabled:border-slate-800 disabled:text-slate-650 hover:bg-primary-500/10 text-primary-400 disabled:bg-surface-950/40 font-bold py-2 rounded-xl transition duration-200 cursor-pointer text-xs"
            >
              ➕ Add to Cart
            </button>
          </form>
        </div>

        {/* Right Side: Cart Card */}
        <div className="lg:col-span-8 border border-slate-800/80 bg-surface-800/40 backdrop-blur-md rounded-3xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-100 mb-4 flex items-center gap-2">
              <span>🛒</span> Cart Checkout
            </h3>

            {/* Form alerts */}
            {formError && (
              <div className="mb-4 p-3.5 rounded-xl border border-rose-500/20 bg-rose-950/20 text-rose-350 text-xs font-semibold flex items-center justify-between">
                <span>⚠ Error: {formError}</span>
                <button onClick={() => setFormError(null)} className="text-rose-450 hover:text-rose-350 font-bold">×</button>
              </div>
            )}

            {formSuccess && (
              <div className="mb-4 p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-950/20 text-emerald-350 text-xs font-semibold flex items-center justify-between">
                <span>✓ {formSuccess}</span>
                <button onClick={() => setFormSuccess(null)} className="text-emerald-450 hover:text-emerald-350 font-bold">×</button>
              </div>
            )}

            {/* Cart Items Table */}
            <div className="overflow-x-auto min-h-[180px] max-h-[260px] overflow-y-auto">
              {cart.length > 0 ? (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800/80 text-slate-500 font-semibold uppercase text-[10px] tracking-wider">
                      <th className="py-2 px-3">Medicine Name</th>
                      <th className="py-2 px-3">Batch</th>
                      <th className="py-2 px-3 text-center" style={{ width: '90px' }}>Qty</th>
                      <th className="py-2 px-3 text-right" style={{ width: '100px' }}>Price</th>
                      <th className="py-2 px-3 text-right" style={{ width: '100px' }}>Total</th>
                      <th className="py-2 px-3 text-right" style={{ width: '60px' }}>Remove</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40">
                    {cart.map((item, idx) => {
                      const isItemOutOfStock = item.quantity_sold > item.available_stock
                      return (
                        <tr key={item.medicine_id} className="hover:bg-surface-800/15 transition-colors">
                          <td className="py-2.5 px-3 font-bold text-slate-200">{item.name}</td>
                          <td className="py-2.5 px-3 text-slate-450 font-mono text-[10px]">{item.batch_number || '—'}</td>
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={item.quantity_sold}
                              onChange={(e) => handleUpdateCartItem(idx, 'quantity_sold', e.target.value)}
                              className={`w-full bg-surface-900 border rounded-lg px-2 py-1 text-center font-bold font-mono text-xs ${
                                isItemOutOfStock ? 'border-rose-500 text-rose-400 bg-rose-950/10' : 'border-slate-800 text-slate-100'
                              }`}
                            />
                            <div className="text-[9px] text-slate-550 mt-0.5">Stock: {item.available_stock}</div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold font-mono text-slate-300">
                            ₹{parseFloat(item.sale_price).toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold font-mono text-slate-200">
                            ₹{(item.quantity_sold * item.sale_price).toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveFromCart(idx)}
                              className="text-slate-550 hover:text-rose-450 font-bold transition text-sm cursor-pointer"
                            >
                              🗑
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-12 text-slate-500 border border-dashed border-slate-800/80 rounded-2xl">
                  <span className="text-2xl block mb-1">🛒</span>
                  <p className="font-semibold text-slate-400 text-xs">Checkout cart is empty</p>
                  <p className="text-[10px] text-slate-600 mt-0.5">Use the left panel to search and add items.</p>
                </div>
              )}
            </div>
          </div>

          {/* Optional Customer Details Form */}
          <div className="border-t border-slate-800/50 pt-4 mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 tracking-wider mb-1.5">
                Customer Name (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. John Doe"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full bg-surface-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-650 focus:outline-none focus:border-primary-500/80 transition-all font-semibold"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 tracking-wider mb-1.5">
                Customer Phone (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. 9876543210"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="w-full bg-surface-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-650 focus:outline-none focus:border-primary-500/80 transition-all font-semibold"
              />
            </div>
          </div>

          {/* Grand total & Submit panel */}
          <div className="border-t border-slate-800/50 pt-4 mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Grand Total</span>
              <div className="text-xl font-black text-emerald-400 mt-0.5 font-mono">
                ₹{grandTotal.toFixed(2)}
              </div>
            </div>

            <button
              onClick={handleSubmitCheckout}
              disabled={isSubmitting || !isCartValid}
              className="w-full sm:w-auto bg-gradient-to-r from-primary-500 to-accent-500 hover:from-primary-600 hover:to-accent-600 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-650 disabled:cursor-not-allowed text-slate-900 font-extrabold px-5 py-2.5 rounded-xl transition duration-200 shadow-lg shadow-primary-500/10 cursor-pointer text-xs uppercase tracking-wider"
            >
              {isSubmitting ? 'Processing Checkout...' : 'Submit Sale & Print'}
            </button>
          </div>
        </div>

      </div>

      {/* Lower Section: Sales History View */}
      <div className="border border-slate-800/80 bg-surface-800/40 backdrop-blur-md rounded-3xl p-6 shadow-xl flex flex-col gap-6">
        
        {/* History Header & Date Filters */}
        <div className="flex flex-col gap-4 border-b border-slate-800/50 pb-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <span>📋</span> Sales History Logs
              </h3>
              <p className="text-slate-400 text-xs mt-1">
                Audit trail of completed multi-item stock transactions.
              </p>
            </div>
            
            <div className="flex gap-4 text-xs font-semibold">
              <span className="bg-surface-900 border border-slate-800 px-3.5 py-1.5 rounded-xl text-slate-400">
                Total Orders: <strong className="text-slate-200 font-mono">{salesHistory.length}</strong>
              </span>
            </div>
          </div>

          {/* Date range inputs */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end mt-2">
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 tracking-wider mb-2">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-surface-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-300 focus:outline-none focus:border-primary-500/80 transition-all font-semibold font-mono"
              />
            </div>
            
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 tracking-wider mb-2">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-surface-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-300 focus:outline-none focus:border-primary-500/80 transition-all font-semibold font-mono"
              />
            </div>

            <div className="md:col-span-2 flex gap-3.5">
              {(startDate || endDate) && (
                <button
                  onClick={handleClearFilters}
                  className="px-4 py-2 border border-slate-800 hover:border-slate-700 bg-surface-900 hover:bg-surface-850 text-slate-400 hover:text-slate-200 text-xs font-bold rounded-xl transition duration-200 cursor-pointer"
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>
        </div>

        {/* History Table */}
        <div className="overflow-x-auto">
          {loadingHistory ? (
            <div className="text-center py-12 text-slate-500 text-sm">
              <div className="relative w-8 h-8 mx-auto mb-3">
                <div className="absolute inset-0 rounded-full border-2 border-primary-500/20" />
                <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary-500 animate-spin" />
              </div>
              <span className="animate-pulse">Loading transaction logs…</span>
            </div>
          ) : salesHistory.length > 0 ? (
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-800/80 text-slate-500 font-semibold uppercase text-xs tracking-wider">
                  <th className="py-3 px-4">Receipt No.</th>
                  <th className="py-3 px-4" style={{ minWidth: '220px' }}>Items Checked Out</th>
                  <th className="py-3 px-4 text-right">Grand Total</th>
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Cashier</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {salesHistory.map((sale) => (
                  <tr key={sale.id} className="hover:bg-surface-800/25 transition-colors group">
                    <td className="py-4 px-4 font-mono font-bold text-slate-400 text-xs">
                      MV-${String(sale.id).padStart(5, '0')}
                      {(sale.customer_name || sale.customer_phone) && (
                        <div className="mt-1 text-[10px] text-slate-500 font-sans font-medium">
                          {sale.customer_name && <div className="text-slate-400">👤 {sale.customer_name}</div>}
                          {sale.customer_phone && <div className="text-slate-400 font-mono">📞 {sale.customer_phone}</div>}
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex flex-col gap-1">
                        {sale.items.map(item => (
                          <div key={item.id} className="text-slate-350 text-xs">
                            <span className="font-bold text-slate-200">{item.medicine_name}</span>
                            <span className="text-slate-500 text-[10px] ml-1.5 font-mono">
                              (x${item.quantity_sold} @ ₹${parseFloat(item.sale_price).toFixed(2)})
                            </span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="py-4 px-4 text-right text-emerald-400 font-bold font-mono">
                      ₹{parseFloat(sale.total_amount).toFixed(2)}
                    </td>
                    <td className="py-4 px-4 text-slate-450 text-xs font-semibold">
                      {new Date(sale.sold_at).toLocaleString()}
                    </td>
                    <td className="py-4 px-4 text-slate-450 text-xs font-semibold">
                      {sale.sold_by || '—'}
                    </td>
                    <td className="py-4 px-4 text-right">
                      <button
                        onClick={() => handlePrintReceipt(sale)}
                        className="text-xs font-bold text-accent-400 hover:text-primary-400 bg-accent-500/5 hover:bg-accent-500/10 border border-accent-500/15 hover:border-primary-500/20 px-2.5 py-1.5 rounded-lg transition-all cursor-pointer opacity-80 group-hover:opacity-100"
                      >
                        🖨 Print Bill
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-16 text-slate-500 border border-dashed border-slate-800/80 rounded-2xl">
              <span className="text-3xl block mb-2">📋</span>
              <p className="font-semibold text-slate-400 text-xs">No sale records logged</p>
              <p className="text-[10px] text-slate-650 mt-1">Submit a new transaction or change the date range filters.</p>
            </div>
          )}
        </div>

      </div>

    </div>
  )
}
