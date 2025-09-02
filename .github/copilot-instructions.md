# Copilot Instructions for vendas-dashboard-2

## Project Overview
- **Type:** React + Vite SPA for sales dashboard
- **Main UI:** `src/` (App.jsx, components/, pages/)
- **Data/Services:** `src/services/` (API calls, business logic)
- **State Management:** Context API (`src/state/`)
- **Styling:** Tailwind CSS (`tailwind.config.js`, `App.css`, etc.)
- **Build Tool:** Vite (`vite.config.js`)

## Key Patterns & Conventions
- **Modular Components:** UI split into feature folders (e.g., `vendedor/`, `admin/`, `status/`).
- **Service Layer:** All external API calls and business logic are in `src/services/`. Use these for backend communication (e.g., `nocodbVendedores.js`, `controleVendas.js`).
- **Status/Workflow Logic:** Status management for clients and sales is handled via modals and service calls (see `EditarStatusClienteModal.jsx`).
- **BIN Convention:** Many status fields use `SIM`/`NAO` (yes/no) strings for toggles.
- **Transferência/Titularidade:** Special logic for client ownership transfer (see `TitularAnteriorModal.jsx`, `EditarStatusClienteModal.jsx`).
- **Protected Routes:** Use `ProtectedRoute.jsx` for auth-guarded pages.
- **Context Usage:** Theme and Auth context in `src/state/`.

## Developer Workflows
- **Start Dev Server:** `npm run dev`
- **Build for Production:** `npm run build`
- **Lint:** `npm run lint` (uses ESLint config)
- **No formal test suite detected** (add if needed)

## Integration Points
- **IXC APIs:** External endpoints for client, contract, and order data (see constants in `EditarStatusClienteModal.jsx`).
- **NocoDB:** Used for vendor/client status persistence (`nocodbVendedores.js`).
- **Modals:** Cross-component communication via props/callbacks (e.g., `onSaved`, `onClose`).

## Examples
- **Auto-fill client status:** See `handleAutoFromIXC` in `EditarStatusClienteModal.jsx` for multi-step API logic and form state updates.
- **Service usage:** Always use service functions for data fetch/update, not direct fetch in components.
- **Component state:** Use React hooks (`useState`, `useEffect`, `useMemo`) for local state and effects.

## File References
- UI: `src/components/`, `src/pages/`
- Services: `src/services/`
- State: `src/state/`
- Utils: `src/utils/`

## Patterns to Follow
- Keep business logic in service files, not components
- Use context for global state (auth, theme)
- Use `SIM`/`NAO` for binary status fields
- Use modals for editing/creating entities

---
For unclear or missing conventions, check `README.md` and service/component files for examples. Ask for feedback if any workflow or pattern is ambiguous.
