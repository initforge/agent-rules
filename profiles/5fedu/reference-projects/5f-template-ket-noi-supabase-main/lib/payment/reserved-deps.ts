/**
 * Reserved QR/payment dependencies (napas-qr, vietqr, qrcode).
 * Re-export for future invoice/payment modules — keeps packages in bundle graph when wired.
 */
export { default as QRCode } from 'qrcode';
export { default as VietQR } from 'vietqr';
export { default as NapasQR } from 'napas-qr';
