# POS Offline Smoke Checklist

Muc tieu: kiem tra nhanh 6 flow quan trong sau moi dot va bugfix, dam bao tinh on dinh va khong vo luong nguoi dung.

## 1) Ban hang binh thuong
- Tao hoa don moi.
- Them 2 san pham, sua so luong, ap dung giam gia.
- Thanh toan bang tien mat.
- Ky vong:
  - Tao hoa don thanh cong.
  - Ton kho tru dung theo so luong ban.
  - In K80 tu dong sau checkout.

## 2) Doi/Tra theo hoa don goc
- Mo popup "Chon hoa don tra hang".
- Chon 1 hoa don, them mat hang tra + mat hang doi.
- Hoan tat phieu doi/tra.
- Ky vong:
  - Tao ban ghi return code.
  - Tong tien chenhlech (thu/tra) tinh dung.
  - In preview K80 tren trang quan ly tra hang.

## 3) Tra nhanh (multi-select)
- Trong popup chon hoa don tra, tick nhieu hoa don.
- Bam "Tra nhanh".
- Ky vong:
  - Khong bi duplicate hoa don trong danh sach.
  - Moi hoa don duoc tao phieu tra.
  - Khong treo UI trong qua trinh xu ly.

## 4) Dong bo ton kho
- Ghi nhan ton kho 1 san pham truoc giao dich.
- Ban hang va tra hang lien tiep voi san pham do.
- Ky vong:
  - Sau ban: ton moi = ton cu - so luong ban.
  - Sau tra: ton moi = ton hien tai + so luong tra.
  - Khong bi am ton ngoai tru khi cho phep.

## 5) Diem khach hang
- Chon khach co diem.
- Thanh toan bang diem (mot phan/hoac toi da).
- Tao giao dich moi cho cung khach.
- Ky vong:
  - Diem bi tru dung sau lan thanh toan bang diem.
  - Diem tich moi duoc cong dung theo cau hinh.
  - Khong bi reset input diem khi dang nhap so.

## 6) Draft hoa don va khoi phuc
- Tao 2 tab hoa don dang do.
- Dong app, mo lai app.
- Chon "Tiep tuc" trong dialog khoi phuc draft.
- Ky vong:
  - Khoi phuc dung so tab + du lieu gio hang.
  - Hien thi "Luu gan nhat" dung thoi gian.
  - Chon "Bo qua" se xoa draft localStorage.

## Tieu chi pass chung
- Khong co man hinh trang.
- Khong hien ma noi bo (`localId`, `_id`, `p_...`) thay cho ma nghiep vu.
- Khong co loi runtime trong console o cac thao tac tren.
