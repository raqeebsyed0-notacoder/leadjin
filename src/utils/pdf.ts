import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { gregorianToHijri } from './date';
import type { LeadjinLead } from '../services/geminiService';

export interface CompanyProfile {
  name: string;
  tagline: string;
  email: string;
  phone: string;
  website: string;
  address: string;
}

export interface QuotationData {
  id: number;
  amount: number;
  subtotal?: number;
  vat_amount?: number;
  currency?: string;
  vat_rate?: number;
  status: string;
  payment_link?: string;
  company_vat_number?: string;
}

/**
 * Generate and download a quotation PDF
 */
export const generateQuotationPdf = async (
  quotation: QuotationData,
  lead: LeadjinLead,
  companyProfile: CompanyProfile
): Promise<void> => {
  try {
    const paymentData = (() => { 
      try { 
        return JSON.parse(quotation.payment_link || '{}'); 
      } catch { 
        return {}; 
      } 
    })();
    
    const items = paymentData.items || [];
    const notes = paymentData.notes || '';
    const currency = paymentData.currency || quotation.currency || 'SAR';
    const vatRate = paymentData.vat_rate || quotation.vat_rate || 0.15;
    const companyVatNumber = paymentData.company_vat_number || quotation.company_vat_number || '';
    
    const subtotal = (quotation.subtotal || quotation.amount) / 100;
    const vatAmount = (quotation.vat_amount || 0) / 100;
    const total = quotation.amount / 100;
    
    const currencySymbols: Record<string, string> = {
      SAR: 'ر.س',
      AED: 'د.إ',
      QAR: 'ر.ق',
      KWD: 'د.ك',
      BHD: 'د.ب',
      USD: '$'
    };
    const currencySymbol = currencySymbols[currency] || '$';
    
    const sender = companyProfile.name || 'LEADJIN Engine';
    const senderTagline = companyProfile.tagline || 'Intelligence Division';
    const today = new Date();
    const hijri = gregorianToHijri(today);
    
    // Saudi Invoice Format with Dual Language
    const htmlContent = `
      <div id="quotation-pdf" style="font-family:Inter,sans-serif;background:#fff;color:#1a1a1a;padding:60px;width:800px;box-sizing:border-box;direction:ltr;">
        <!-- Dual Language Header -->
        <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #3182ce;padding-bottom:30px;margin-bottom:30px;">
          <div>
            <h1 style="font-size:28px;font-weight:300;margin:0;letter-spacing:-1px;color:#3182ce;">${sender}</h1>
            <p style="font-size:14px;margin:4px 0 0;color:#666;direction:rtl;text-align:right;">شركة / فاتورة ضريبية</p>
            <p style="font-size:10px;letter-spacing:3px;opacity:0.5;text-transform:uppercase;margin:8px 0 0;">${senderTagline}</p>
            ${companyProfile.email ? `<p style="font-size:11px;opacity:0.6;margin:4px 0 0;">${companyProfile.email}</p>` : ''}
            ${companyProfile.phone ? `<p style="font-size:11px;opacity:0.6;margin:2px 0 0;">${companyProfile.phone}</p>` : ''}
            ${companyVatNumber ? `<p style="font-size:11px;opacity:0.6;margin:2px 0 0;">VAT: ${companyVatNumber}</p>` : ''}
          </div>
          <div style="text-align:right;">
            <p style="font-size:11px;font-weight:700;opacity:0.4;text-transform:uppercase;letter-spacing:2px;margin:0;">Tax Invoice / فاتورة ضريبية</p>
            <p style="font-size:20px;font-weight:300;margin:8px 0 0;color:#3182ce;">QT-${quotation.id}-${today.getFullYear()}</p>
            <p style="font-size:12px;margin:6px 0 0;opacity:0.7;">${today.toLocaleDateString()} / ${hijri.formatted}</p>
            <p style="font-size:10px;opacity:0.5;margin:4px 0 0;">Status: ${quotation.status}</p>
          </div>
        </div>
        
        <!-- Billed To / From -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-bottom:30px;">
          <div style="background:#f8f9fa;padding:20px;border-radius:8px;">
            <p style="font-size:9px;font-weight:700;opacity:0.4;text-transform:uppercase;letter-spacing:2px;margin:0 0 12px;">Billed To / المستلم</p>
            <p style="font-size:16px;font-weight:500;margin:0;">${lead.name}</p>
            <p style="font-size:12px;opacity:0.6;margin:4px 0 0;">${lead.title}</p>
            <p style="font-size:12px;opacity:0.6;margin:2px 0 0;font-weight:500;">${lead.company}</p>
          </div>
          <div style="background:#f8f9fa;padding:20px;border-radius:8px;">
            <p style="font-size:9px;font-weight:700;opacity:0.4;text-transform:uppercase;letter-spacing:2px;margin:0 0 12px;">From / من</p>
            <p style="font-size:14px;font-weight:500;margin:0;">${sender}</p>
            <p style="font-size:11px;opacity:0.6;margin:4px 0 0;">${companyProfile.address || ''}</p>
          </div>
        </div>
        
        <!-- Line Items Table -->
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
          <thead>
            <tr style="background:#3182ce14;border-bottom:2px solid #3182ce;">
              <th style="padding:12px 16px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Service Item / بند</th>
              <th style="padding:12px 16px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Amount (${currency}) / المبلغ</th>
            </tr>
          </thead>
          <tbody>
            ${items.length > 0 ? items.map((item: any) => `
              <tr style="border-bottom:1px solid #eee;">
                <td style="padding:12px 16px;font-size:13px;">${item.label || item}</td>
                <td style="padding:12px 16px;text-align:right;font-family:monospace;font-size:13px;">${currencySymbol}${Number(item.amount || 0).toLocaleString()}</td>
              </tr>`).join('') : `
              <tr style="border-bottom:1px solid #eee;">
                <td style="padding:12px 16px;font-size:13px;">Professional Services</td>
                <td style="padding:12px 16px;text-align:right;font-family:monospace;font-size:13px;">${currencySymbol}${subtotal.toLocaleString()}</td>
              </tr>`}
          </tbody>
        </table>
        
        <!-- Totals Breakdown -->
        <div style="background:#f8f9fa;padding:20px;border-radius:8px;margin-bottom:20px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
            <span style="font-size:12px;opacity:0.7;">Subtotal / المجموع الفرعي</span>
            <span style="font-size:13px;font-family:monospace;">${currencySymbol}${subtotal.toLocaleString()}</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
            <span style="font-size:12px;opacity:0.7;">VAT ${(vatRate * 100).toFixed(0)}% / ضريبة القيمة المضافة</span>
            <span style="font-size:13px;font-family:monospace;">${currencySymbol}${vatAmount.toLocaleString()}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding-top:12px;border-top:2px solid #3182ce;margin-top:12px;">
            <span style="font-size:14px;font-weight:700;">TOTAL / المجموع</span>
            <span style="font-size:18px;font-weight:700;color:#3182ce;font-family:monospace;">${currencySymbol}${total.toLocaleString()}</span>
          </div>
        </div>
        
        ${notes ? `<div style="background:#f9f9f9;padding:16px 20px;border-radius:8px;margin-bottom:20px;"><p style="font-size:10px;font-weight:700;opacity:0.4;text-transform:uppercase;margin:0 0 8px;">Terms / شروط</p><p style="font-size:12px;line-height:1.5;margin:0;">${notes}</p></div>` : ''}
        
        <!-- Signature -->
        <div style="border-top:1px solid #eee;padding-top:24px;display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:20px;">
          <div>
            <div style="width:200px;border-bottom:1px solid #ccc;padding-bottom:8px;margin-bottom:8px;"><span style="font-size:10px;opacity:0.3;font-style:italic;">Authorized Signature / التوقيع الخاص</span></div>
            <p style="font-size:12px;margin:0;">${lead.name}</p>
            <p style="font-size:10px;opacity:0.4;margin:2px 0 0;">${lead.company}</p>
          </div>
          <p style="font-size:9px;opacity:0.3;font-family:monospace;">QT-${quotation.id}-${today.getFullYear()}</p>
        </div>
        
        <!-- ZATCA Disclaimer -->
        <div style="background:#fff3cd;padding:12px 16px;border-radius:6px;border:1px solid #ffeaa7;margin-top:16px;">
          <p style="font-size:10px;color:#856404;margin:0;line-height:1.4;">
            ⚠️ <strong>Important:</strong> This is not a ZATCA-registered invoice. For official tax registration, visit: zatca.gov.sa
          </p>
          <p style="font-size:9px;color:#856404;margin:4px 0 0;opacity:0.8;direction:rtl;text-align:right;">
            :ةيماركلا ةبيط ةبيرضلا ةرازو يف ةيميقتسلاا ةبيرضلا تاداعإل ةيصوصخملا ةرادلإا هذه سيل .ةيرسم ةبيرض ةروتاف هذه سيل
          </p>
        </div>
      </div>`;
      
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.innerHTML = htmlContent;
    document.body.appendChild(container);
    
    const el = container.querySelector('#quotation-pdf') as HTMLElement;
    const { default: html2canvasDynamic } = await import('html2canvas');
    const canvas = await html2canvasDynamic(el, { scale: 2, useCORS: true, backgroundColor: '#fff' });
    
    document.body.removeChild(container);
    
    const { jsPDF: jsPDFDynamic } = await import('jspdf');
    const pdf = new jsPDFDynamic('p', 'mm', 'a4');
    const imgData = canvas.toDataURL('image/png');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`quotation_${quotation.id}_${lead.company.toLowerCase().replace(/\s+/g, '_')}.pdf`);
  } catch (err) {
    console.error('Quotation PDF failed:', err);
    throw err;
  }
};
