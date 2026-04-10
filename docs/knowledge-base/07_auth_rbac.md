# Module: Basis Administration (Auth, RBAC & Security)

> GlassTech S/4HANA ERP -- Authentication & Access Control Knowledge Base
> For LLM Copilot Ingestion (Gemma 4)

---

## User Roles Allowed

Only `super_admin` can manage users and roles via the Basis Admin module.

---

## Core Workflows (Step-by-Step)

### Workflow 1: User Login (Google OAuth + Device Auth)

**Screen:** Login Page

1. User opens ERP application
2. System checks for saved device credentials:
   - **WebAuthn (Biometric):** If fingerprint/PIN credential exists, prompt for biometric
   - **Remember Token:** If 30-day remember token exists and not expired, auto-login
   - **Neither:** Show Google Sign-In button
3. Click **Sign in with Google** -- redirects to Google OAuth
4. After Google auth, system:
   - Fetches user profile from `user_profiles` Supabase table
   - Checks: Is user active? (`is_active = true`)
   - Checks: If `time_restricted = true`, verifies office hours (Mon-Sat 9am-6pm PKT)
   - Checks: User has valid role and company assignment
5. **Device Setup Prompt:** First-time login on device:
   - Option 1: **Register Biometric** (fingerprint/PIN via WebAuthn)
   - Option 2: **Remember Device** (30-day token in localStorage)
   - Option 3: **Skip** (must sign in fully next time)
6. Login complete -- user directed to Launchpad

### Workflow 2: User Management (Super Admin Only)

**Screen:** Basis Admin > User Manager

**Create New User:**
1. First: Create user in **Supabase Dashboard > Authentication > Users**
2. Copy the UUID from Supabase
3. Open **Basis Admin** in ERP
4. Click **+ Add User**
5. Paste UUID, enter Email, Full Name
6. Select Role from dropdown (auto-populates company/module presets)
7. Toggle Allowed Companies (multi-select)
8. Toggle Allowed Modules (11 modules grid -- empty = all access)
9. Toggle Time Restriction (office hours enforcement)
10. Toggle Is Active
11. Click **Save** -- record inserted/updated in `user_profiles` table

**Role Presets (Auto-Populate):**
| Preset | Companies | Modules |
|--------|-----------|---------|
| super_admin | All | All |
| gtk_admin | GTK + GTI | All |
| glassco_admin | Glassco | All |
| glassco_production | Glassco | production, inventory, logistics, requisitions |
| nippon_admin | Nippon | sales, inventory, hr, accounts, requisitions |

**Deactivate User:**
1. Open user record
2. Toggle **Is Active** to off
3. Save -- user cannot login until reactivated

### Workflow 3: RBAC Permission Assignment

**Screen:** Human Capital > RBAC (for granular permissions)

1. Navigate to HCM > RBAC tab
2. View/Create Roles: Admin, Supervisor, Team Lead, Store Incharge, Viewer
3. Assign Permissions to Role:
   - Module: hr, attendance, payroll, production, finance, store, procurement, sales, projects, logistics, vendors, hub, md-dashboard, admin
   - Action: create, read, update, delete
   - Scope: own, department, company, all
4. Assign Role to Employee:
   - Select employee from list
   - Assign role(s) with timestamp and assigner name

---

## Strict Business Rules & Constraints

### BUG-1 Fix: Multi-Company Isolation
- **Problem:** `profile` field was missing from auth store, causing `profile?.company` to return `undefined`
- **Fix:** Both `user` and `profile` kept in perfect sync in Zustand store
- **Impact:** All 14+ service files depend on `useAuthStore.getState().profile?.company` for company filtering
- **Resolution Priority:** profile.company > allowedCompanies[0] > ROLE_DEFAULT_COMPANY[role]

### SEC-2: Multi-Tenant Isolation (Defense-in-Depth)
- **Layer 1:** Application-layer `.eq('company', ...)` on every query
- **Layer 2:** Supabase Row-Level Security (RLS) policies
- **Guarantee:** Even if one layer fails, the other prevents cross-tenant data exposure

### Office Hours Restriction
- **Rule:** Users with `time_restricted = true` can only access during Mon-Sat 9am-6pm PKT (UTC+5)
- **Enforcement:** Checked at login and periodically during session
- **Auto-logout:** Outside office hours for time-restricted users

### WebAuthn Security
- **Platform authenticator only** (device-bound, no roaming keys)
- **User verification required** (biometric or device PIN)
- **Algorithms:** ES256 + RS256
- **Storage:** Credential ID in localStorage (`gt_webauthn_cred`)
- **Fallback:** 30-day remember token if WebAuthn unavailable

### Service Role Key Protection
- Supabase service role key NEVER exposed to browser
- User management delegated to `manage-users` Edge Function
- Edge Function has admin privileges for user CRUD

---

## Role Definitions (19 Roles)

### Admin Roles (Full Access)
| Role | Default Company | Description |
|------|----------------|-------------|
| `super_admin` | GTK | Full access to everything, all companies |
| `owner` | GTK | Owner/MD level access |
| `hassan` | GTK | System Administrator |

### Company Admin Roles
| Role | Default Company | Module Access |
|------|----------------|--------------|
| `gtk_admin` | GTK | All modules |
| `glassco_admin` | Glassco | All modules |
| `nippon_admin` | Nippon | sales, inventory, hr, accounts, requisitions |

### Operational Roles
| Role | Default Company | Module Access |
|------|----------------|--------------|
| `factory_manager` | Glassco | production, inventory, requisitions, factory-incharge |
| `admin_officer` | Glassco | sales, inventory, logistics, requisitions, accounts |
| `glassco_supervisor` | Glassco | production, inventory, requisitions |
| `gtk_supervisor` | GTK | production, inventory, requisitions |
| `gti_supervisor` | GTI | production, inventory, requisitions |
| `glassco_cutter` | Glassco | production only |
| `dispatch_staff` | Glassco | production, logistics |
| `glassco_production` | Glassco | production, inventory, logistics, requisitions |

---

## Module Access Matrix

### Available Modules (11)
hr, sales, projects, inventory, logistics, vendors, production, accounts, hub, requisitions, admin

### Role-to-Module Mapping
| Role | hr | sales | projects | inventory | logistics | vendors | production | accounts | hub | requisitions | admin |
|------|----|----|----|----|----|----|----|----|----|----|-----|
| super_admin/owner/hassan | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| gtk_admin/glassco_admin | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| factory_manager | - | - | - | Y | - | - | Y | - | - | Y | - |
| admin_officer | - | Y | - | Y | Y | - | - | Y | - | Y | - |
| Supervisor roles | - | - | - | Y | - | - | Y | - | - | Y | - |
| glassco_cutter | - | - | - | - | - | - | Y | - | - | - | - |
| dispatch_staff | - | - | - | - | Y | - | Y | - | - | - | - |
| glassco_production | - | - | - | Y | Y | - | Y | - | - | Y | - |
| nippon_admin | Y | Y | - | Y | - | - | - | Y | - | Y | - |

---

## RBAC Permission Model

### Scope Hierarchy (Widest Wins)
```
all > company > department > own
```

| Scope | Description |
|-------|-------------|
| `all` | Access across all companies (super admin only) |
| `company` | Access within own company |
| `department` | Access within same department |
| `own` | Access to self-records only |

### Default Role Permissions

**Admin Role:**
- All modules: create, read, update, delete @ company scope
- admin module: all actions @ all scope

**Supervisor Role:**
- hr: read, update @ department
- attendance: create, read, update @ department
- payroll: read @ own
- production: create, read, update, delete @ department
- store: read, create @ company
- procurement: read @ company

**Team Lead Role:**
- hr: read @ department
- attendance: create, read @ department
- payroll: read @ own
- production: create, read, update @ department

**Store Incharge Role:**
- hr: read @ own
- store: create, read, update, delete @ company
- procurement: create, read @ company
- payroll: read @ own

**Viewer Role:**
- hr: read @ own
- payroll: read @ own

### Permission Check Flow
```
hasPermission(employeeId, module, action) returns { allowed, scope }

1. Get employee's assigned roles
2. Get role-permission links
3. Find permissions matching module + action
4. Return widest scope found
5. Super admin (from JWT) bypasses all checks
```

---

## State Machines

### Authentication Flow
```
idle ----[Check Device]----> biometric (if WebAuthn exists)
  |                              |
  |                         [Verify]----> done
  |
  +---[No Device Auth]----> google (OAuth sign-in)
                               |
                          [Google Auth Success]
                               |
                          [Profile Fetch + Time Check]
                               |
                          device_choice
                               |
                    +----------+-----------+
                    |          |           |
               device_setup  remember     skip
                    |          |           |
                    +----------+-----------+
                               |
                              done
```

### User Profile Status
```
Active ----[Deactivate]----> Inactive (cannot login)
Inactive --[Reactivate]----> Active
```

---

## Multi-Company Architecture

### Companies
| Code | Full Name | Description |
|------|-----------|-------------|
| GTK | GTK Group | Aluminum fabrication (windows, doors) |
| GTI | GTI Group | Aluminum fabrication (sister company) |
| Glassco | Glassco Group | Glass cutting & processing |
| Nippon | Nippon Group | Glass distribution |
| Factory | Factory Group | Shared factory operations |

### Company Resolution Priority
```
1. profile.company (from user_profiles DB table)
2. profile.allowedCompanies[0] (first allowed company)
3. ROLE_DEFAULT_COMPANY[role] (role-based fallback)
4. Empty string (only if profile is null)
```

### Cross-Company Rules
- Users can be assigned to multiple companies via `allowedCompanies` array
- Company selector in sidebar (top-left) shows allowed companies only
- All data queries filter by selected company
- Intercompany transfers are the ONLY mechanism for cross-company data flow

---

## Security Architecture

### Authentication Layers
1. **Google OAuth** -- primary identity verification
2. **WebAuthn** -- device-bound biometric/PIN (optional, recommended)
3. **Remember Token** -- 30-day device token (fallback)
4. **Supabase Session** -- JWT-based session management

### Data Protection Layers
1. **Supabase RLS** -- database-level row filtering by company
2. **Application Filter** -- `.eq('company', ...)` on every query
3. **Role-Based Access** -- module-level visibility control
4. **RBAC Permissions** -- action-level (create/read/update/delete) + scope-level

### Audit Trail
- Login events logged to `access_logs` table
- AI agent actions logged to `agent_actions` table
- GL entries track `createdBy`, `draftedBy`, `approvedBy`
- All mutations include timestamps

---

## Session Management

### Persistence
- Zustand store with persist middleware
- localStorage key: `glasstech-auth`
- Stores: user object + profile object
- Survives page refresh

### Warm Cache on Login
- `SalesService.warmCache()` called in background after login
- Pre-loads frequently accessed data (clients, quotations, invoices)
- Non-blocking -- app usable immediately

### Sign Out
- Calls `supabase.auth.signOut()`
- Clears all device auth tokens
- Clears Zustand store
- Redirects to login page
