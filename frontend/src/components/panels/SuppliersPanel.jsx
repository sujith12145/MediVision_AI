import { useState } from 'react'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import GlassCard from '../ui/GlassCard'
import Badge from '../ui/Badge'

export default function SuppliersPanel() {
  const { showToast } = useWorkspace()
  
  const [suppliers, setSuppliers] = useState([
    { name: 'Cipla Laboratories', rating: '98.5%', items: 120, reliability: 'Excellent', leadTime: '2 days' },
    { name: 'Abbott Healthcare', rating: '96.2%', items: 85, reliability: 'High', leadTime: '3 days' },
    { name: 'Sun Pharmaceutical', rating: '94.0%', items: 140, reliability: 'Stable', leadTime: '4 days' },
    { name: 'Zydus Cadila', rating: '89.4%', items: 60, reliability: 'Verify', leadTime: '5 days' }
  ])

  const [purchaseOrders, setPurchaseOrders] = useState([
    { poNum: 'PO-240801', supplier: 'Cipla Laboratories', item: 'Paracetamol 650mg', qty: 500, status: 'approved', date: '2026-08-01' },
    { poNum: 'PO-240728', supplier: 'Abbott Healthcare', item: 'Amoxicillin 500mg', qty: 250, status: 'shipped', date: '2026-07-28' },
    { poNum: 'PO-240715', supplier: 'Sun Pharmaceutical', item: 'Atorvastatin 10mg', qty: 1000, status: 'delivered', date: '2026-07-15' }
  ])

  const [form, setForm] = useState({ supplier: '', medicine: '', qty: '100' })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleOrderSubmit = (e) => {
    e.preventDefault()
    if (!form.supplier || !form.medicine || !form.qty) {
      showToast('Verify all fields before committing order.', 'error')
      return
    }

    setIsSubmitting(true)
    setTimeout(() => {
      const newPO = {
        poNum: `PO-${Math.floor(100000 + Math.random() * 900000)}`,
        supplier: form.supplier,
        item: form.medicine,
        qty: parseInt(form.qty),
        status: 'approved',
        date: new Date().toISOString().split('T')[0]
      }
      setPurchaseOrders(prev => [newPO, ...prev])
      showToast(`Purchase Order ${newPO.poNum} created successfully!`, 'success')
      setForm({ supplier: '', medicine: '', qty: '100' })
      setIsSubmitting(false)
    }, 800)
  }

  const getStatusBadge = (status) => {
    switch (status) {
      case 'approved': return 'accent'
      case 'shipped': return 'warning'
      case 'delivered': return 'success'
      default: return 'neutral'
    }
  }

  return (
    <div className="panel-enter flex flex-col gap-6">
      
      {/* Header */}
      <div className="panel-header">
        <div>
          <h2 className="panel-title flex items-center gap-2">
            <span>🤝</span> Suppliers &amp; Purchase Orders
          </h2>
          <p className="panel-subtitle">Manage wholesale catalogs, dispatch speeds, and order queues</p>
        </div>
      </div>

      {/* Grid split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        
        {/* Suppliers cards list */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {suppliers.map((s, idx) => (
              <GlassCard key={idx} className="p-5 flex flex-col justify-between gap-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-sm font-bold text-slate-200 truncate max-w-[150px]">{s.name}</h4>
                    <span className="text-[10px] text-slate-500 font-semibold block mt-0.5">Average dispatch speed: {s.leadTime}</span>
                  </div>
                  <Badge variant={s.reliability === 'Excellent' || s.reliability === 'High' ? 'success' : s.reliability === 'Stable' ? 'cyan' : 'warning'}>
                    {s.reliability}
                  </Badge>
                </div>

                <div className="flex gap-6 text-[10px] font-bold text-slate-500 font-mono">
                  <div>Reliability: <span className="text-slate-250 font-bold">{s.rating}</span></div>
                  <div>Line Items: <span className="text-slate-250 font-bold">{s.items}</span></div>
                </div>
              </GlassCard>
            ))}
          </div>

          {/* Active PO grid */}
          <GlassCard className="p-5 flex flex-col gap-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 pb-2 border-b border-border">
              Pending &amp; Completed Purchase Orders
            </h3>

            <div className="overflow-x-auto">
              <table className="mv-table text-xs">
                <thead>
                  <tr>
                    <th>PO Number</th>
                    <th>Supplier</th>
                    <th>Ordered Item</th>
                    <th className="text-center">Quantity</th>
                    <th>Log Date</th>
                    <th className="text-right">Ship Status</th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseOrders.map((po, idx) => (
                    <tr key={idx}>
                      <td className="font-mono text-slate-400 font-bold text-xs">{po.poNum}</td>
                      <td className="font-bold text-slate-200 truncate max-w-[120px]">{po.supplier}</td>
                      <td className="text-slate-350">{po.item}</td>
                      <td className="text-center font-mono font-bold text-slate-200">{po.qty}</td>
                      <td className="font-mono text-slate-450">{po.date}</td>
                      <td className="text-right">
                        <Badge variant={getStatusBadge(po.status)} className="font-mono uppercase text-[9px]">
                          {po.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </div>

        {/* PO creation form */}
        <div className="lg:col-span-4">
          <GlassCard className="p-5 flex flex-col gap-4 h-full">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 pb-2 border-b border-border mb-2">
                Compile Wholesale PO
              </h3>
              <p className="text-[10px] text-slate-500 leading-normal">
                Select a verified supplier to generate a purchase requisition.
              </p>
            </div>

            <form onSubmit={handleOrderSubmit} className="flex flex-col gap-4 text-xs font-semibold mt-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] uppercase font-bold text-slate-550">Choose Supplier</label>
                <select 
                  value={form.supplier} 
                  onChange={(e) => setForm(prev => ({ ...prev, supplier: e.target.value }))}
                  className="input-base text-xs font-bold"
                >
                  <option value="">-- Select Vendor --</option>
                  {suppliers.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] uppercase font-bold text-slate-550">Medicine Name</label>
                <input 
                  type="text"
                  required
                  placeholder="e.g. Paracetamol 500mg"
                  value={form.medicine}
                  onChange={(e) => setForm(prev => ({ ...prev, medicine: e.target.value }))}
                  className="input-base"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] uppercase font-bold text-slate-550">Quantity (Units)</label>
                <input 
                  type="number"
                  min="1"
                  required
                  value={form.qty}
                  onChange={(e) => setForm(prev => ({ ...prev, qty: e.target.value }))}
                  className="input-base font-mono font-bold"
                />
              </div>

              <button 
                type="submit"
                disabled={isSubmitting}
                className="btn-primary w-full py-2.5 mt-2 text-xs font-bold uppercase tracking-wider"
              >
                {isSubmitting ? 'Submitting PO...' : '📥 Dispatch Purchase Requisition'}
              </button>
            </form>
          </GlassCard>
        </div>

      </div>

    </div>
  )
}
