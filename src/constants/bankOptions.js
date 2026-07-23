export const BANK_OPTIONS = [
  { code: 'VCB', bin: 970436, name: 'Vietcombank - Ngân hàng TMCP Ngoại thương Việt Nam' },
  { code: 'BIDV', bin: 970418, name: 'BIDV - Ngân hàng TMCP Đầu tư và Phát triển Việt Nam' },
  { code: 'CTG', bin: 970415, name: 'VietinBank - Ngân hàng TMCP Công Thương Việt Nam' },
  { code: 'AGRIBANK', bin: 970405, name: 'Agribank - Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam' },
  { code: 'TCB', bin: 970407, name: 'Techcombank - Ngân hàng TMCP Kỹ thương Việt Nam' },
  { code: 'MB', bin: 970422, name: 'MB - Ngân hàng TMCP Quân đội' },
  { code: 'ACB', bin: 970416, name: 'ACB - Ngân hàng TMCP Á Châu' },
  { code: 'VPB', bin: 970432, name: 'VPBank - Ngân hàng TMCP Việt Nam Thịnh Vượng' },
  { code: 'TPB', bin: 970423, name: 'TPBank - Ngân hàng TMCP Tiên Phong' },
  { code: 'STB', bin: 970403, name: 'Sacombank - Ngân hàng TMCP Sài Gòn Thương Tín' },
  { code: 'HDB', bin: 970437, name: 'HDBank - Ngân hàng TMCP Phát triển TP.HCM' },
  { code: 'VIB', bin: 970441, name: 'VIB - Ngân hàng TMCP Quốc tế Việt Nam' },
  { code: 'MSB', bin: 970426, name: 'MSB - Ngân hàng TMCP Hàng Hải Việt Nam' },
  { code: 'SHB', bin: 970443, name: 'SHB - Ngân hàng TMCP Sài Gòn - Hà Nội' },
  { code: 'SEAB', bin: 970440, name: 'SeABank - Ngân hàng TMCP Đông Nam Á' },
  { code: 'OCB', bin: 970448, name: 'OCB - Ngân hàng TMCP Phương Đông' },
  { code: 'EIB', bin: 970431, name: 'Eximbank - Ngân hàng TMCP Xuất Nhập Khẩu Việt Nam' },
  { code: 'SCB', bin: 970429, name: 'SCB - Ngân hàng TMCP Sài Gòn' },
  { code: 'ABB', bin: 970425, name: 'ABBank - Ngân hàng TMCP An Bình' },
  { code: 'PVB', bin: 970412, name: 'PVcomBank - Ngân hàng TMCP Đại Chúng Việt Nam' },
];

export const BANK_OPTION_MAP = BANK_OPTIONS.reduce((acc, bank) => {
  acc[bank.code] = bank;
  return acc;
}, {});
