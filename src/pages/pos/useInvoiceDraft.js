import { useCallback, useEffect, useRef, useState } from 'react';

const POS_INVOICE_DRAFT_KEY = 'pos_offline_invoice_draft_v1';

export function isInvoiceDirty(invoice) {
  if (!invoice || typeof invoice !== 'object') return false;
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const returnItems = Array.isArray(invoice.returnItems) ? invoice.returnItems : [];
  const exchangeItems = Array.isArray(invoice.exchangeItems) ? invoice.exchangeItems : [];
  if (items.length > 0 || returnItems.length > 0 || exchangeItems.length > 0) return true;
  if (invoice.returnMode && invoice.returnOrder) return true;
  if ((Number(invoice.amountPaid) || 0) > 0) return true;
  if ((Number(invoice.discount) || 0) > 0) return true;
  if (String(invoice.orderNote || '').trim()) return true;
  if (String(invoice.customerPhone || '').trim()) return true;
  if (String(invoice.customerName || '').trim()) return true;
  if (String(invoice.customerLocalId || '').trim()) return true;
  return false;
}

export function useInvoiceDraft({
  invoiceTabs,
  invoices,
  activeInvoiceIndex,
  setInvoiceTabs,
  setInvoices,
  setActiveInvoiceIndex,
  invoiceIdCounterRef,
  invoiceLabelCounterRef,
}) {
  const [restoreDraftDialogOpen, setRestoreDraftDialogOpen] = useState(false);
  const [pendingDraftData, setPendingDraftData] = useState(null);
  const draftHydratedRef = useRef(false);

  useEffect(() => {
    if (draftHydratedRef.current) return;
    draftHydratedRef.current = true;
    try {
      const raw = localStorage.getItem(POS_INVOICE_DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      const tabs = Array.isArray(parsed.invoiceTabs) ? parsed.invoiceTabs : [];
      const storedInvoices = parsed.invoices && typeof parsed.invoices === 'object' ? parsed.invoices : null;
      if (!tabs.length || !storedInvoices) return;
      const hasDirtyDraft = tabs.some((tab) => isInvoiceDirty(storedInvoices[tab.id]));
      if (!hasDirtyDraft) return;
      setPendingDraftData(parsed);
      setRestoreDraftDialogOpen(true);
    } catch (error) {
      console.warn('Không đọc được draft hóa đơn:', error);
    }
  }, []);

  useEffect(() => {
    if (!draftHydratedRef.current) return;
    const saveTimer = setTimeout(() => {
      try {
        const payload = {
          version: 1,
          savedAt: Date.now(),
          invoiceTabs,
          invoices,
          activeInvoiceIndex,
          invoiceIdCounter: invoiceIdCounterRef.current,
          invoiceLabelCounter: invoiceLabelCounterRef.current,
        };
        localStorage.setItem(POS_INVOICE_DRAFT_KEY, JSON.stringify(payload));
      } catch (error) {
        console.warn('Không thể lưu draft hóa đơn:', error);
      }
    }, 500);
    return () => clearTimeout(saveTimer);
  }, [activeInvoiceIndex, invoiceIdCounterRef, invoiceLabelCounterRef, invoiceTabs, invoices]);

  const discardPendingDraft = useCallback(() => {
    localStorage.removeItem(POS_INVOICE_DRAFT_KEY);
    setRestoreDraftDialogOpen(false);
    setPendingDraftData(null);
  }, []);

  const applyPendingDraft = useCallback(() => {
    const draft = pendingDraftData;
    if (draft && Array.isArray(draft.invoiceTabs) && draft.invoices) {
      setInvoiceTabs(draft.invoiceTabs);
      setInvoices(draft.invoices);
      const activeId = draft.activeInvoiceIndex;
      const validActive = draft.invoiceTabs.some((t) => t.id === activeId);
      setActiveInvoiceIndex(validActive ? activeId : (draft.invoiceTabs[0]?.id ?? 0));
      invoiceIdCounterRef.current = Math.max(Number(draft.invoiceIdCounter) || 1, 1);
      invoiceLabelCounterRef.current = Math.max(Number(draft.invoiceLabelCounter) || 2, 2);
    }
    setRestoreDraftDialogOpen(false);
    setPendingDraftData(null);
  }, [invoiceIdCounterRef, invoiceLabelCounterRef, pendingDraftData, setActiveInvoiceIndex, setInvoiceTabs, setInvoices]);

  const closeRestoreDraftDialog = useCallback(() => {
    setRestoreDraftDialogOpen(false);
    setPendingDraftData(null);
  }, []);

  return {
    restoreDraftDialogOpen,
    pendingDraftData,
    closeRestoreDraftDialog,
    discardPendingDraft,
    applyPendingDraft,
  };
}
