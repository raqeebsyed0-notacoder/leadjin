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
 * Generate and download a proposal PDF
 */
export const generateProposalPdf = async (
  elementId: string, 
  companyName: string,
  gsseMetadata?: { logic_hash?: string }
): Promise<void> => {
  const element = document.getElementById(elementId);
  if (!element) return;

  try {
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      onclone: (clonedDoc) => {
        // Remove all stylesheets that might contain oklch/oklab which html2canvas fails to parse
        const styleSheets = clonedDoc.querySelectorAll('style, link[rel="stylesheet"]');
        styleSheets.forEach(s => s.remove());

        const el = clonedDoc.getElementById(elementId);
        if (el) {
          // Force light theme variables and basic layout styles since we removed stylesheets
          el.style.display = 'block';
          el.style.width = '800px';
          el.style.padding = '60px';
          el.style.borderRadius = '40px';
          el.style.border = '1px solid rgba(49, 130, 206, 0.2)';
          el.style.fontFamily = 'Inter, sans-serif';
          el.style.setProperty('--app-text', '#3182ce');
          el.style.setProperty('--app-accent', '#3182ce');
          el.style.setProperty('--app-bg', '#ffffff');
          el.style.setProperty('--app-border', 'rgba(49, 130, 206, 0.2)');
          el.style.color = '#3182ce';
          el.style.backgroundColor = '#ffffff';
          
          // Add GSSE Watermark/Seal
          const seal = clonedDoc.createElement('div');
          seal.innerHTML = `
            <div style="position: absolute; top: 40px; right: 40px; border: 3px solid #3182ce; color: #3182ce; padding: 15px; border-radius: 15px; transform: rotate(15deg); opacity: 0.3; font-family: sans-serif; text-align: center; pointer-events: none; z-index: 100;">
              <div style="font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: 3px;">GSSE VERIFIED</div>
              <div style="font-size: 8px; font-family: monospace; margin-top: 6px; font-weight: bold;">ORIGIN: LEADJIN-PROPRIETARY</div>
              <div style="font-size: 7px; font-family: monospace; margin-top: 2px;">${gsseMetadata?.logic_hash?.substring(0, 16) || 'SECURE-HASH'}</div>
            </div>
          `;
          el.appendChild(seal);
          
          // Force all children styles
          const all = el.getElementsByTagName('*');
          for (let i = 0; i < all.length; i++) {
            const child = all[i] as HTMLElement;
            
            if (child.classList.contains('text-app-accent')) {
              child.style.color = '#3182ce';
            }
            
            if (child.classList.contains('text-app-text') || child.classList.contains('text-app-bg')) {
              if (child.classList.contains('text-app-bg')) {
                child.style.color = '#ffffff';
              } else {
                child.style.color = '#3182ce';
              }
            } else if (!child.style.color) {
              child.style.color = '#3182ce';
            }

            if (child.classList.contains('border-app-accent') || child.classList.contains('border-app-border') || child.classList.contains('border-b')) {
              child.style.borderColor = 'rgba(49, 130, 206, 0.2)';
              if (child.classList.contains('border-b')) child.style.borderBottomWidth = '1px';
              if (child.classList.contains('border-l-4')) child.style.borderLeftWidth = '4px';
            }

            if (child.classList.contains('glass') || child.classList.contains('bg-app-accent/5') || child.classList.contains('bg-app-accent/10')) {
              child.style.backgroundColor = 'rgba(49, 130, 206, 0.05)';
              child.style.backdropFilter = 'none';
              (child.style as any).webkitBackdropFilter = 'none';
              child.style.borderRadius = '20px';
            }

            // Layout properties
            if (child.classList.contains('flex')) child.style.display = 'flex';
            if (child.classList.contains('justify-between')) child.style.justifyContent = 'space-between';
            if (child.classList.contains('items-center')) child.style.alignItems = 'center';
            if (child.classList.contains('items-end')) child.style.alignItems = 'flex-end';
            if (child.classList.contains('grid')) child.style.display = 'grid';
            if (child.classList.contains('grid-cols-2')) child.style.gridTemplateColumns = '1fr 1fr';
            if (child.classList.contains('gap-12')) child.style.gap = '48px';
            if (child.classList.contains('gap-4')) child.style.gap = '16px';
            
            // Spacing
            if (child.classList.contains('space-y-12')) {
              Array.from(child.children).forEach((c, idx) => {
                if (idx > 0) (c as HTMLElement).style.marginTop = '48px';
              });
            }
            if (child.classList.contains('space-y-6')) {
              Array.from(child.children).forEach((c, idx) => {
                if (idx > 0) (c as HTMLElement).style.marginTop = '24px';
              });
            }
            if (child.classList.contains('space-y-4')) {
              Array.from(child.children).forEach((c, idx) => {
                if (idx > 0) (c as HTMLElement).style.marginTop = '16px';
              });
            }
            if (child.classList.contains('space-y-1')) {
              Array.from(child.children).forEach((c, idx) => {
                if (idx > 0) (c as HTMLElement).style.marginTop = '4px';
              });
            }

            // Table styles
            if (child.tagName === 'TABLE') {
              child.style.width = '100%';
              child.style.borderCollapse = 'collapse';
            }
            if (child.tagName === 'TH' || child.tagName === 'TD') {
              child.style.padding = '24px';
              child.style.textAlign = child.classList.contains('text-right') ? 'right' : 'left';
            }

            // Typography
            if (child.classList.contains('text-right')) child.style.textAlign = 'right';
            if (child.classList.contains('text-4xl')) child.style.fontSize = '36px';
            if (child.classList.contains('text-2xl')) child.style.fontSize = '24px';
            if (child.classList.contains('text-xl')) child.style.fontSize = '20px';
            if (child.classList.contains('text-sm')) child.style.fontSize = '14px';
            if (child.classList.contains('text-[10px]')) child.style.fontSize = '10px';
            if (child.classList.contains('text-[9px]')) child.style.fontSize = '9px';
            if (child.classList.contains('font-light')) child.style.fontWeight = '300';
            if (child.classList.contains('font-bold')) child.style.fontWeight = '700';
            if (child.classList.contains('font-mono')) child.style.fontFamily = 'monospace';
            if (child.classList.contains('uppercase')) child.style.textTransform = 'uppercase';
            if (child.classList.contains('tracking-widest')) child.style.letterSpacing = '0.1em';
            if (child.classList.contains('tracking-tighter')) child.style.letterSpacing = '-0.05em';
            if (child.classList.contains('pb-12')) child.style.paddingBottom = '48px';
            if (child.classList.contains('pl-6')) child.style.paddingLeft = '24px';
            if (child.classList.contains('pt-12')) child.style.paddingTop = '48px';
            if (child.classList.contains('w-64')) child.style.width = '256px';
          }
        }
      }
    });
    
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`proposal_${companyName.toLowerCase().replace(/\s+/g, '_')}.pdf`);
  } catch (err) {
    console.error('PDF Generation failed:', err);
    throw err;
  }
};

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
