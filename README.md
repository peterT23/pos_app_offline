# pos_offline (v0.1 — khung kỹ thuật)

## Mục tiêu

- **Offline hoàn toàn**: không cần MongoDB Atlas khi chỉ bán tại máy.
- **Electron** (desktop) + **React + MUI** (UI) + **SQLite** (DB file trên máy).

## SQLite có tốn phí không?

**Không.** SQLite là file DB + thư viện nhúng, không phí license kiểu cloud.

## Electron trên Mac?

**Được.** Dev chạy `npm run dev` trên macOS; sau này có thể đóng gói `.app` / notarize nếu phân phối.

## Cấu trúc hiện tại (v0.1)

| Phần | Vai trò |
|------|---------|
| `electron/main.cjs` | Cửa sổ app, khởi tạo SQLite (`better-sqlite3`), IPC. |
| `electron/preload.cjs` | Cầu an toàn `contextBridge` → renderer. |
| `src/` | React + MUI (UI). |

Chưa tách thành 3 repo `pos-app / pos-admin / pos-backend` — vì offline POS thường gộp **một app** + module. Khi lớn, có thể tách `packages/` theo monorepo (pnpm/npm workspaces).

## Chạy thử

```bash
cd /Users/admin/Downloads/ManagementAPP/pos_offline
npm install
npm run dev
```

## Lộ trình gộp UI từ POS hiện tại

1. Copy từng màn/component từ `../POS/pos-app/src/...` sang `src/`.
2. Thay `Dexie`/API bằng IPC gọi SQLite ở `main`.
3. Giữ MUI theme/spacing giống để nhìn quen.

## Lưu ý kỹ thuật

- `better-sqlite3` biên dịch native: trên Mac thường ổn; nếu lỗi build, báo log để xử lý (đôi khi cần Xcode CLI tools).
- Không chạy SQLite trực tiếp trong renderer nếu muốn bảo mật tốt — nên qua **main + IPC** (đang làm vậy).
