"use client";

import React, { useState, useEffect } from "react";
import { useSales } from "../context/SalesContext";
import { useContacts } from "@/features/contacts/context/ContactsContext";
import { useProducts } from "@/features/products/context/ProductsContext";
import { ShoppingCart, Plus, Trash2, Package, Wrench, Store, FileText, ChevronDown, User } from "lucide-react";
import { SaleStatus, PaymentStatus, SaleType, SaleItem } from "@/features/sales";

import { ModalShell } from "@/components/ui/global/modal/ModalShell";
import { ModalHeader } from "@/components/ui/global/modal/ModalHeader";
import { ModalContent } from "@/components/ui/global/modal/ModalContent";
import { ModalFooter } from "@/components/ui/global/modal/ModalFooter";
import { GlobalInput } from "@/components/ui/global/form/GlobalInput";

const convertCurrency = async (amount: number, from: string, to: string) => {
  if (from === to) return amount;
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${from}`);
    if (!res.ok) throw new Error("Failed to fetch rates");
    const data = await res.json();
    const rate = data.rates[to];
    if (rate) return amount * rate;
  } catch { }
  const fallbackRates: Record<string, number> = { USD: 1, EUR: 0.92, GBP: 0.79, IDR: 16000, SGD: 1.35 };
  return (amount / (fallbackRates[from] || 1)) * (fallbackRates[to] || 1);
};

const SALE_TYPES: { value: SaleType; label: string; icon: React.ReactNode }[] = [
  { value: "Product Sale", label: "Product Sale", icon: <Package size={11} strokeWidth={2} /> },
  { value: "Service Order", label: "Service Order", icon: <Wrench size={11} strokeWidth={2} /> },
  { value: "Retail", label: "Retail", icon: <Store size={11} strokeWidth={2} /> },
  { value: "Manual", label: "Manual Entry", icon: <FileText size={11} strokeWidth={2} /> },
];

const CURRENCIES = ["USD", "IDR", "EUR", "GBP", "SGD"];
const PAYMENT_STATUSES: PaymentStatus[] = ["Unpaid", "Partially Paid", "Paid"];

function newItem(): SaleItem {
  return { id: Math.random().toString(36).substring(7), name: "", quantity: 1, price: 0, discount: 0, discountType: "percentage", subtotal: 0 };
}

function calcSubtotal(item: SaleItem): number {
  const base = item.price * item.quantity;
  const discountAmt = item.discountType === "fixed" ? item.discount : base * (item.discount / 100);
  return Math.max(0, base - discountAmt);
}

function formatCurrency(val: number, currency: string = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(val);
}

/* Reusable click dropdown */
function Dd<T extends string>({ value, opts, onChange, renderT, renderO }: {
  value: T; opts: T[]; onChange: (v: T) => void;
  renderT: (v: T) => React.ReactNode; renderO: (v: T) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(v => !v)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] hover:bg-black/[0.04] transition-colors" style={{ border: "1px solid rgba(0,0,0,0.09)" }}>
        {renderT(value)}
        <ChevronDown size={10} strokeWidth={2} style={{ color: "var(--color-on-surface-variant)", opacity: 0.5 }} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 py-1 rounded-[8px] shadow-xl" style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.1)", minWidth: 155 }}>
          {opts.map(o => (
            <button type="button" key={o} onClick={() => { onChange(o); setOpen(false); }} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-black/[0.04] text-left transition-colors">
              {renderO(o)}
              {value === o && <span className="ml-auto font-label-caps text-[8px]" style={{ color: "var(--color-on-surface-variant)", opacity: 0.4 }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* Section label */
function SL({ icon, children, right }: { icon?: React.ReactNode; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="font-label-caps text-[9px] uppercase tracking-[0.12em] font-semibold" style={{ color: "var(--color-on-surface-variant)", opacity: 0.38 }}>
          {children}
        </span>
      </div>
      {right}
    </div>
  );
}

export default function AddSaleModal({ onClose }: { onClose: () => void }) {
  const { addSale } = useSales();
  const { contacts } = useContacts();
  const { allProducts } = useProducts();

  const [saleType, setSaleType] = useState<SaleType>("Product Sale");
  const [title, setTitle] = useState("");
  const [contactName, setContactName] = useState("");
  const [isContactDropdownOpen, setIsContactDropdownOpen] = useState(false);
  const [activeItemDropdownId, setActiveItemDropdownId] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("Unpaid");
  const [items, setItems] = useState<SaleItem[]>([newItem()]);
  const [orderDiscount, setOrderDiscount] = useState("");
  const [orderDiscountType, setOrderDiscountType] = useState<"percentage" | "fixed">("percentage");
  const [taxPercentage, setTaxPercentage] = useState("");
  const [currency, setCurrency] = useState("USD");

  // Track original (pre-conversion) prices for product-linked items so we can re-convert when currency changes
  const [productOriginals, setProductOriginals] = useState<Record<string, { price: number; currency: string }>>({});

  // Re-convert item prices when currency changes
  useEffect(() => {
    if (Object.keys(productOriginals).length === 0) return;
    const run = async () => {
      const updates: Record<string, number> = {};
      for (const [itemId, orig] of Object.entries(productOriginals)) {
        updates[itemId] = await convertCurrency(orig.price, orig.currency, currency);
      }
      setItems(prev => prev.map(it => {
        if (updates[it.id] === undefined) return it;
        const updated = { ...it, price: updates[it.id] };
        updated.subtotal = calcSubtotal(updated);
        return updated;
      }));
    };
    run();
  }, [currency]);

  const addLineItem = () => setItems(prev => [...prev, newItem()]);
  const removeLineItem = (id: string) => {
    if (items.length === 1) return;
    setItems(prev => prev.filter(it => it.id !== id));
  };
  const updateItem = (id: string, field: keyof SaleItem, value: any) => {
    setItems(prev => prev.map(it => {
      if (it.id !== id) return it;
      const updated = { ...it, [field]: value };
      updated.subtotal = calcSubtotal(updated);
      return updated;
    }));
  };

  const subtotal = items.reduce((acc, it) => acc + it.subtotal, 0);
  const rawOrderDiscount = parseFloat(orderDiscount) || 0;
  const orderDiscountAmt = orderDiscountType === "fixed" ? rawOrderDiscount : subtotal * (rawOrderDiscount / 100);
  const clampedOrderDiscountAmt = Math.min(subtotal, Math.max(0, orderDiscountAmt));
  const rawTax = parseFloat(taxPercentage) || 0;
  const taxAmt = Math.max(0, (subtotal - clampedOrderDiscountAmt) * (rawTax / 100));
  const total = Math.max(0, subtotal - clampedOrderDiscountAmt + taxAmt);
  const isValid = title.trim() || items.some(it => it.name.trim());

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const hasItems = items.some(it => it.name.trim());
    if (!title.trim() && !hasItems) return;

    const cleanTitle = title.trim() || (items[0]?.name ? items[0].name : "New Sale");
    const cleanItems = items.filter(it => it.name.trim());

    addSale({
      title: cleanTitle,
      saleType,
      contactName: contactName.trim() || undefined,
      paymentStatus,
      status: paymentStatus === "Paid" ? "Completed" : "Pending",
      items: cleanItems,
      orderDiscountValue: rawOrderDiscount,
      orderDiscountType,
      discountTotal: clampedOrderDiscountAmt,
      taxPercentage: rawTax,
      taxAmount: taxAmt,
      subtotal,
      total,
      currency,
    });
    onClose();
  };

  const footerSummary = (
    <div className="flex items-center gap-2 sm:gap-4">
      <div className="font-display text-[11px] font-semibold flex gap-1.5 items-center shrink-0" style={{ color: "var(--color-on-surface-variant)", opacity: 0.6 }}>
        {items.filter(it => it.name.trim()).length} item{items.filter(it => it.name.trim()).length !== 1 ? "s" : ""}
      </div>
      <div className="flex gap-2 sm:gap-4 font-display text-[11px] flex-1 justify-end mr-1">
        <div className="flex flex-col items-end shrink-0">
          <span className="text-[8px] font-label-caps uppercase tracking-wider text-on-surface-variant/50">Subtotal</span>
          <span className="font-semibold text-on-surface/80">{formatCurrency(subtotal, currency)}</span>
        </div>
        {clampedOrderDiscountAmt > 0 && (
          <div className="flex flex-col items-end shrink-0">
            <span className="text-[8px] font-label-caps uppercase tracking-wider text-on-surface-variant/50">
              Disc {orderDiscountType === "percentage" && orderDiscount ? `(${orderDiscount}%)` : ""}
            </span>
            <span className="font-semibold text-on-surface-variant/80">−{formatCurrency(clampedOrderDiscountAmt, currency)}</span>
          </div>
        )}
        {taxAmt > 0 && (
          <div className="flex flex-col items-end shrink-0">
            <span className="text-[8px] font-label-caps uppercase tracking-wider text-on-surface-variant/50">
              Tax {taxPercentage ? `(${taxPercentage}%)` : ""}
            </span>
            <span className="font-semibold text-on-surface-variant/80">+{formatCurrency(taxAmt, currency)}</span>
          </div>
        )}
        <div className="flex flex-col items-end shrink-0">
          <span className="text-[8px] font-label-caps uppercase tracking-wider text-on-surface-variant/50">Total</span>
          <span className="font-bold text-[13px] text-on-surface">{formatCurrency(total, currency)}</span>
        </div>
      </div>
    </div>
  );

  return (
    <ModalShell onClose={onClose} maxWidth={640}>
      <ModalHeader title="New Sale" onClose={onClose} />

      <ModalContent className="db-sidebar space-y-6">
        {/* Title */}
        <div className="space-y-4">
          <GlobalInput
            autoFocus
            maxLength={60}
            placeholder="Sale Title (e.g. Website Redesign)…"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="font-display font-semibold"
            style={{ fontSize: "16px", background: "transparent", border: "none", padding: "0" }}
          />

          <div className="flex items-center gap-2 flex-wrap pt-2">
            <Dd
              value={saleType} opts={SALE_TYPES.map(t => t.value)} onChange={setSaleType}
              renderT={t => {
                const meta = SALE_TYPES.find(x => x.value === t)!;
                return <><span style={{ color: "var(--color-on-surface-variant)", opacity: 0.7 }}>{meta.icon}</span><span className="font-label-caps text-[10px] font-semibold" style={{ color: "var(--color-on-surface-variant)", opacity: 0.9 }}>{t.toUpperCase()}</span></>;
              }}
              renderO={t => {
                const meta = SALE_TYPES.find(x => x.value === t)!;
                return <><span style={{ color: "var(--color-on-surface-variant)", opacity: 0.7 }}>{meta.icon}</span><span className="font-body-md text-[12px]" style={{ color: "var(--color-on-surface-variant)", opacity: 0.9 }}>{t}</span></>;
              }}
            />
            <Dd
              value={paymentStatus} opts={PAYMENT_STATUSES} onChange={setPaymentStatus}
              renderT={s => <><span className="font-label-caps text-[10px] font-semibold" style={{ color: "var(--color-on-surface-variant)", opacity: 0.9 }}>{s.toUpperCase()}</span></>}
              renderO={s => <><span className="font-body-md text-[12px]" style={{ color: "var(--color-on-surface-variant)", opacity: 0.9 }}>{s}</span></>}
            />
            <Dd
              value={currency} opts={CURRENCIES} onChange={setCurrency}
              renderT={c => <><span className="font-label-caps text-[10px] font-semibold" style={{ color: "var(--color-on-surface-variant)", opacity: 0.9 }}>{c}</span></>}
              renderO={c => <><span className="font-body-md text-[12px]" style={{ color: "var(--color-on-surface-variant)", opacity: 0.9 }}>{c}</span></>}
            />
          </div>
        </div>

        {/* Contact — matches Invoice design */}
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="relative">
              <GlobalInput
                label="Contact"
                icon={<User size={11} strokeWidth={1.75} />}
                maxLength={40}
                placeholder="Select or enter contact"
                value={contactName}
                onChange={e => setContactName(e.target.value)}
                onFocus={() => setIsContactDropdownOpen(true)}
                onBlur={() => setTimeout(() => setIsContactDropdownOpen(false), 200)}
              />
              {isContactDropdownOpen && (
                <div className="absolute top-[calc(100%+4px)] left-0 w-full bg-surface-container-lowest border border-black/10 rounded-[8px] shadow-lg z-50 max-h-48 overflow-y-auto py-1">
                  {contacts.filter(c => c.name.toLowerCase().includes(contactName.toLowerCase())).length > 0 ? (
                    contacts.filter(c => c.name.toLowerCase().includes(contactName.toLowerCase())).map(c => (
                      <div
                        key={c.id}
                        className="px-3 py-2 cursor-pointer hover:bg-black/5 font-display text-[13px] text-on-surface transition-colors"
                        onClick={() => {
                          setContactName(c.name);
                          setIsContactDropdownOpen(false);
                        }}
                      >
                        {c.name}
                      </div>
                    ))
                  ) : (
                    <div className="px-3 py-3 text-center text-on-surface-variant opacity-50 font-body-sm text-[12px]">
                      No contacts found
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Line Items — matches Invoice design */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-label-caps text-[9px] uppercase tracking-[0.12em] font-semibold" style={{ color: "var(--color-on-surface-variant)", opacity: 0.38 }}>
              Line Items
            </span>
            <button type="button" onClick={addLineItem} className="flex items-center gap-1.5 text-[10.5px] font-medium" style={{ color: "var(--color-primary)" }}>
              <Plus size={12} strokeWidth={2} /> Add Item
            </button>
          </div>

          <div className="grid grid-cols-[1fr_56px_80px_80px_80px_28px] gap-2 items-center px-2">
            <span className="font-label-caps text-[8px] uppercase tracking-[0.12em] font-semibold opacity-40">Description</span>
            <span className="font-label-caps text-[8px] uppercase tracking-[0.12em] font-semibold opacity-40 text-center">Qty</span>
            <span className="font-label-caps text-[8px] uppercase tracking-[0.12em] font-semibold opacity-40 text-right">Price</span>
            <span className="font-label-caps text-[8px] uppercase tracking-[0.12em] font-semibold opacity-40 text-right">Discount</span>
            <span className="font-label-caps text-[8px] uppercase tracking-[0.12em] font-semibold opacity-40 text-right">Line Total</span>
            <span />
          </div>

          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="group">
                <div className="grid grid-cols-[1fr_56px_80px_80px_80px_28px] gap-2 items-center">
                  {/* Description with product autocomplete dropdown */}
                  <div className="relative">
                    <input
                      placeholder="Item description (type or select)..."
                      value={item.name}
                      maxLength={40}
                      onChange={e => {
                        updateItem(item.id, "name", e.target.value);
                        // User manually editing — clear original so we don't re-convert
                        setProductOriginals(prev => { const n = { ...prev }; delete n[item.id]; return n; });
                      }}
                      onFocus={() => setActiveItemDropdownId(item.id)}
                      onBlur={() => setTimeout(() => setActiveItemDropdownId(null), 200)}
                      className="w-full bg-black/[0.02] border border-black/[0.06] rounded-[6px] px-3 py-1.5 font-display text-[13px] outline-none focus:bg-white focus:border-primary/30 transition-all placeholder:opacity-40"
                    />
                    {activeItemDropdownId === item.id && (
                      <div className="absolute top-[calc(100%+4px)] left-0 w-[240px] bg-surface-container-lowest border border-black/10 rounded-[8px] shadow-lg z-50 max-h-48 overflow-y-auto py-1">
                        {allProducts.filter(p => p.name.toLowerCase().includes((item.name || "").toLowerCase())).length > 0 ? (
                          allProducts.filter(p => p.name.toLowerCase().includes((item.name || "").toLowerCase())).map(p => (
                            <div
                              key={p.id}
                              className="px-3 py-2 cursor-pointer hover:bg-black/5 flex justify-between items-center transition-colors"
                              onMouseDown={async (e) => {
                                e.preventDefault();
                                updateItem(item.id, "name", p.name);
                                // Store original for re-conversion on currency change
                                setProductOriginals(prev => ({ ...prev, [item.id]: { price: p.price, currency: p.currency || "USD" } }));
                                const convertedPrice = await convertCurrency(p.price, p.currency || "USD", currency);
                                updateItem(item.id, "price", convertedPrice);
                                setActiveItemDropdownId(null);
                              }}
                            >
                              <span className="font-display text-[13px] text-on-surface truncate pr-2">{p.name}</span>
                              <span className="font-body-sm text-[11px] text-on-surface-variant opacity-60 shrink-0">{formatCurrency(p.price, p.currency || "USD")}</span>
                            </div>
                          ))
                        ) : (
                          <div className="px-3 py-3 text-center text-on-surface-variant opacity-50 font-body-sm text-[12px]">
                            No products found
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <input
                    type="number" min="1" max="999"
                    value={item.quantity || ""}
                    onChange={e => updateItem(item.id, "quantity", parseInt(e.target.value) || 0)}
                    className="w-full bg-black/[0.02] border border-black/[0.06] rounded-[6px] px-2 py-1.5 font-display text-[13px] outline-none text-center focus:bg-white focus:border-primary/30 transition-all"
                  />
                  <input
                    type="number" min="0"
                    value={item.price || ""}
                    onChange={e => updateItem(item.id, "price", parseFloat(e.target.value) || 0)}
                    className="w-full bg-black/[0.02] border border-black/[0.06] rounded-[6px] px-2 py-1.5 font-display text-[13px] outline-none text-right focus:bg-white focus:border-primary/30 transition-all"
                  />
                  <div className="relative flex items-center bg-black/[0.02] border border-black/[0.06] rounded-[6px] focus-within:bg-white focus-within:border-primary/30 transition-all overflow-hidden">
                    <input
                      type="number" min="0"
                      value={item.discount || ""}
                      onChange={e => updateItem(item.id, "discount", parseFloat(e.target.value) || 0)}
                      className="w-full bg-transparent px-2 py-1.5 font-display text-[13px] outline-none text-right"
                    />
                    <button
                      type="button"
                      onClick={() => updateItem(item.id, "discountType", item.discountType === "fixed" ? "percentage" : "fixed")}
                      className="px-1.5 py-1.5 text-[10px] font-bold text-on-surface-variant opacity-60 hover:opacity-100 hover:bg-black/5 border-l border-black/[0.06] transition-all"
                    >
                      {item.discountType === "fixed" ? "$" : "%"}
                    </button>
                  </div>
                  <div className="text-right font-display text-[13px] font-semibold opacity-80 pl-1 truncate" title={formatCurrency(item.subtotal, currency)}>
                    {item.subtotal > 0 ? formatCurrency(item.subtotal, currency) : "—"}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLineItem(item.id)}
                    disabled={items.length === 1}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-md transition-all flex items-center justify-center opacity-40 hover:opacity-100 disabled:opacity-10"
                  >
                    <Trash2 size={13} strokeWidth={2} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="flex justify-end pt-2">
            <div className="w-full flex justify-end items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="font-label-caps text-[9px] uppercase tracking-[0.12em] font-semibold opacity-40 ml-auto">Order Discount</span>
                <div className="w-[120px] relative flex items-center bg-black/[0.02] border border-black/[0.06] rounded-[6px] focus-within:bg-white focus-within:border-primary/30 transition-all overflow-hidden">
                  <input
                    type="number" min="0"
                    value={orderDiscount}
                    onChange={e => setOrderDiscount(e.target.value)}
                    className="w-full bg-transparent pl-3 pr-2 py-1.5 font-display text-[13px] outline-none text-right"
                    placeholder="0.00"
                  />
                  <button
                    type="button"
                    onClick={() => setOrderDiscountType(prev => prev === "fixed" ? "percentage" : "fixed")}
                    className="px-2 py-1.5 text-[11px] font-bold text-on-surface-variant opacity-60 hover:opacity-100 hover:bg-black/5 border-l border-black/[0.06] transition-all"
                  >
                    {orderDiscountType === "fixed" ? "$" : "%"}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-label-caps text-[9px] uppercase tracking-[0.12em] font-semibold opacity-40 ml-auto">Tax</span>
                <div className="w-[100px] relative flex items-center bg-black/[0.02] border border-black/[0.06] rounded-[6px] focus-within:bg-white focus-within:border-primary/30 transition-all overflow-hidden">
                  <input
                    type="number" min="0"
                    value={taxPercentage}
                    onChange={e => setTaxPercentage(e.target.value)}
                    className="w-full bg-transparent pl-3 pr-2 py-1.5 font-display text-[13px] outline-none text-right"
                    placeholder="0.00"
                  />
                  <div className="px-2 py-1.5 text-[11px] font-bold text-on-surface-variant opacity-60 bg-black/[0.02] border-l border-black/[0.06]">
                    %
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

      </ModalContent>

      <ModalFooter summary={footerSummary}>
        <button type="button" onClick={onClose} className="font-label-caps text-[10px] uppercase tracking-[0.05em] font-semibold px-3.5 py-2 rounded-[6px] hover:bg-black/[0.05] transition-colors" style={{ color: "var(--color-on-surface-variant)", opacity: 0.65 }}>
          Cancel
        </button>
        <button type="button" onClick={handleSubmit} disabled={!isValid} className="font-label-caps text-[10px] uppercase tracking-[0.05em] font-semibold px-4 py-2 rounded-[6px] disabled:opacity-30 hover:-translate-y-px transition-all" style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}>
          Create Sale
        </button>
      </ModalFooter>
    </ModalShell>
  );
}
