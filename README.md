
# Glasstech Factory 2026 ERP

A professional Enterprise Resource Planning (ERP) system tailored for the Glasstech Group (GTK, GTI, Glassco, Nippon, and Factory).

## 🚀 How to Run the App

This application is built as a modern React application using **TypeScript (.tsx)** and **Tailwind CSS**.

### Option 1: Development Environment (Recommended)
Because the app uses `.tsx` files, a simple static file server (like `serve` or Python's `http.server`) will not work locally as it cannot process TypeScript. Use a tool that supports JSX/TSX:

1.  **Vite (Fastest)**:
    ```bash
    npx vite
    ```
2.  **Parcel**:
    ```bash
    npx parcel index.html
    ```

### Option 2: Production Build
To deploy, you must first transpile the TypeScript code to JavaScript using a bundler like Vite or Webpack.

---

## 📂 Backend & Database Management

### Current Implementation: Database-on-Client (Standalone)
The app currently uses a **Database Management Layer** located in `storageService.ts`. 
- **Persistence**: Data is saved to `localStorage` (Browser Database).
- **Security**: Data is scoped to the specific Company (GTK, GTI, etc.) selected.
- **Backup**: You can export the entire database as a `.json` file using the `StorageService.exportDatabaseToFile()`.

### Future Implementation: Full Server-Side Backend
A **Backend Structure** has been prepared in `server.ts`. To transition to a full server:
1.  Set up a Node.js environment.
2.  Install dependencies: `npm install express cors body-parser`.
3.  Run `node server.ts`.
4.  Update `storageService.ts` to use `fetch()` instead of `localStorage`.

---

## 🛠 Features
- **Company Selection**: Switch between 5 different factory units.
- **SAP-Inspired UI**: Enterprise-grade density and professional color palettes.
- **Chart of Accounts**: 5-level hierarchical G/L architecture.
- **General Ledger**: Balanced double-entry manual journal vouchers.
- **HR & Payroll**: Automatic salary calculation based on attendance, late penalties (1/3 deduction for 3 lates), and weekend overtime.

---
*© 2026 Glasstech Group - Internal Enterprise Systems*
