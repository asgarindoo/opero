"use client";

import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from "react";
import { SaleOpportunity, SaleStatus, PaymentStatus, SaleType, SaleActivity, SaleItem } from "@/features/sales";
import { createSale, deleteSale, listSales, updateSale as saveSale } from "@/features/sales";
import { listProducts, updateProduct } from "@/features/products/services/products.client";
import type { Product, StockActivity } from "@/features/products/types";
import { useTenant } from "@/components/providers/TenantProvider";
import { getUserDisplayName, getUserInitials } from "@/lib/user-identity";

interface SalesContextType {
  sales: SaleOpportunity[];
  addSale: (sale: Partial<SaleOpportunity>) => void;
  updateSale: (id: string, updates: Partial<SaleOpportunity>) => void;
  addActivity: (saleId: string, activity: Omit<SaleActivity, "id" | "timestamp" | "author"> & { author?: string }) => void;
  deleteSales: (ids: string[]) => void;
  // Callback buat Finance saat sale dibayar
  onSalePaid?: (sale: SaleOpportunity) => void;
  setSalePaidCallback: (cb: ((sale: SaleOpportunity) => void) | undefined) => void;
  loading: boolean;
}

const SalesContext = createContext<SalesContextType | undefined>(undefined);

export function SalesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useTenant();
  const userName = getUserDisplayName(user, "You");

  const [sales, setSales] = useState<SaleOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [onSalePaid, setOnSalePaid] = useState<((sale: SaleOpportunity) => void) | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const items = await listSales<SaleOpportunity>();
        if (!cancelled) setSales(items);
      } catch (err) {
        console.error("Failed to load sales:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const setSalePaidCallback = useCallback((cb: ((sale: SaleOpportunity) => void) | undefined) => {
    setOnSalePaid(() => cb);
  }, []);

  function computeTotals(items: SaleItem[], discountTotal = 0, taxAmount = 0) {
    const subtotal = items.reduce((acc, item) => acc + item.subtotal, 0);
    const total = Math.max(0, subtotal - discountTotal + taxAmount);
    return { subtotal, total };
  }

  const addSale = useCallback((partial: Partial<SaleOpportunity>) => {
    const nextOrderNum = "SAL-" + new Date().getFullYear() + "-" + (sales.length + 1).toString().padStart(3, "0");
    const items = partial.items || [];
    const { subtotal, total } = computeTotals(items, partial.discountTotal || 0, partial.taxAmount || 0);

    const partialWithoutTotals = { ...partial };
    delete (partialWithoutTotals as any).subtotal;
    delete (partialWithoutTotals as any).total;

    const newSale: SaleOpportunity = {
      id: "s" + Date.now(),
      orderNumber: nextOrderNum,
      title: partial.title || "New Sale",
      saleType: partial.saleType || "Product Sale",
      contactName: partial.contactName || undefined,
      contactId: partial.contactId || undefined,
      status: partial.status || "Pending",
      paymentStatus: partial.paymentStatus || "Unpaid",
      currency: "USD",
      items,
      subtotal,
      discountTotal: partial.discountTotal || 0,
      total,
      activities: [{
        id: Math.random().toString(36).substring(7),
        type: "status_change",
        description: "Sale record created",
        timestamp: new Date().toISOString(),
        userId: user?.id,
        author: userName,
        email: user?.email ?? undefined,
        avatar: user?.image ?? null,
        initials: getUserInitials(user)
      }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...partialWithoutTotals,
    };
    createSale<SaleOpportunity>(newSale)
      .then((created) => setSales(prev => [created, ...prev]))
      .catch((err) => console.error("Failed to create sale:", err));
  }, [sales.length, user?.email, user?.id, user?.image, userName]);

  const updateSale = useCallback((id: string, updates: Partial<SaleOpportunity>) => {
    setSales(prev => prev.map(s => {
      if (s.id !== id) return s;

      const updated = {
        ...s,
        ...updates,
        updatedAt: new Date().toISOString()
      };

      if (updates.items || updates.discountTotal !== undefined || updates.taxAmount !== undefined) {
        const { subtotal, total } = computeTotals(updated.items, updated.discountTotal || 0, updated.taxAmount || 0);
        updated.subtotal = subtotal;
        updated.total = total;
      }

      // Trigger Finance kalau status bayar berubah ke Paid
      if (updates.paymentStatus === "Paid" && s.paymentStatus !== "Paid") {
        onSalePaid?.(updated);
      }

      // Kurangi stok saat sale selesai
      if (updates.status === "Completed" && s.status !== "Completed" && updated.items.length > 0) {
        (async () => {
          try {
            const products = await listProducts<Product>();
            for (const item of updated.items) {
              if (item.productId && item.quantity > 0) {
                const product = products.find(p => p.id === item.productId);
                if (product && product.type === "Physical") {
                  const newActivity: StockActivity = {
                    id: Math.random().toString(36).substring(7),
                    type: "stock_out",
                    quantity: -item.quantity,
                    description: `sold via sale ${updated.orderNumber}`,
                    timestamp: new Date().toISOString(),
                    userId: user?.id,
                    author: userName,
                    email: user?.email ?? undefined,
                    avatar: user?.image ?? null,
                    initials: getUserInitials(user)
                  };
                  const recordId = (product as any).recordId ?? product.id;
                  await updateProduct<Product>(recordId, {
                    totalQuantity: Math.max(0, product.totalQuantity - item.quantity),
                    activities: [newActivity, ...product.activities]
                  });
                }
              }
            }
          } catch (err) {
            console.error("Failed to auto-deduct stock:", err);
          }
        })();
      }

      const recordId = (s as { recordId?: string }).recordId ?? s.id;
      saveSale<SaleOpportunity>(recordId, updated).catch((err) => {
        console.error("Failed to update sale:", err);
      });
      return updated;
    }));
  }, [onSalePaid, user?.email, user?.id, user?.image, userName]);

  const addActivity = useCallback((saleId: string, activity: Omit<SaleActivity, "id" | "timestamp" | "author"> & { author?: string }) => {
    setSales(prev => prev.map(s => {
      if (s.id !== saleId) return s;
      const { author = userName, ...rest } = activity;
      const newActivity: SaleActivity = {
        id: Math.random().toString(36).substring(7),
        timestamp: new Date().toISOString(),
        userId: user?.id,
        author,
        email: user?.email ?? undefined,
        avatar: user?.image ?? null,
        initials: getUserInitials(user),
        ...rest,
      };
      const updated = {
        ...s,
        activities: [newActivity, ...s.activities],
        updatedAt: newActivity.timestamp
      };
      const recordId = (s as { recordId?: string }).recordId ?? s.id;
      saveSale<SaleOpportunity>(recordId, updated).catch((err) => {
        console.error("Failed to add sale activity:", err);
      });
      return updated;
    }));
  }, [user?.email, user?.id, user?.image, userName]);

  const deleteSales = useCallback((ids: string[]) => {
    setSales(prev => prev.filter(s => !ids.includes(s.id)));
    Promise.all(
      ids.map((id) => {
        const recordId = sales.find(s => s.id === id) as { recordId?: string } | undefined;
        const targetId = recordId?.recordId ?? id;
        return deleteSale(targetId).catch((err) => {
          console.error("Failed to delete sale:", err);
        });
      })
    ).catch(() => undefined);
  }, [sales]);

  const value = useMemo(() => ({
    sales,
    addSale,
    updateSale,
    addActivity,
    deleteSales,
    onSalePaid,
    setSalePaidCallback,
    loading
  }), [sales, addSale, updateSale, addActivity, deleteSales, onSalePaid, setSalePaidCallback, loading]);

  return <SalesContext.Provider value={value}>{children}</SalesContext.Provider>;
}

export function useSales() {
  const context = useContext(SalesContext);
  if (context === undefined) {
    throw new Error("useSales must be used within a SalesProvider");
  }
  return context;
}
