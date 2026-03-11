# Planning Document Template

This document defines the standard format for Electron desktop app planning documents.

## Storage Location

Save planning documents in `electron-app-plans/[app-name].md`.

## Format Template

```markdown
# Desktop App Planning: [App Name]

**Planner**: [User Name/Team Name]
**Date**: YYYY-MM-DD
**Version**: 1.0
**Status**: Planning / In Development / Beta / Released

---

## 1. Executive Summary

### App Overview
[One-sentence description of the app]

### Problems to Solve
[Problems faced by users]

### Target Users
[Specific personas]

### Target Platforms
- [ ] Windows
- [ ] macOS
- [ ] Linux

### Uniqueness and Differentiation
[Difference from competitors, difference from Web apps]

### Monetization Model
> **Reference**: [MONETIZATION.md](../common/MONETIZATION.md) - Detailed guide to monetization strategies

[One-time purchase / Subscription / Freemium / Free]

---

## 2. Market and Competitive Analysis

### 2-1. Research of Similar Apps

| App Name | Platform | Price | Strengths | Weaknesses |
|----------|----------|-------|-----------|------------|
| Competitor A | Win/Mac | $XX | ... | ... |
| Competitor B | Win/Mac/Linux | Free | ... | ... |
| Competitor C | Mac | $XX | ... | ... |

### 2-2. Reasons Why a Desktop App is Suitable
- [Features not possible with Web apps]
- [Need for offline support]
- [Utilization of native features]
- [Performance requirements]

### 2-3. Differentiation Strategy
- [Differentiation points from competitors]
- [Unique value proposition]

---

## 3. User Personas

### Persona 1: [Name]
- **Occupation**: [...]
- **OS Used**: Windows / macOS / Linux
- **Challenges**: [...]
- **Expected Solution**: [...]
- **Usage Scene**: [...]

### Persona 2: [Name] (Add as needed)
[...]

---

## 4. Functional Design (MVP)

### 4-1. Core Features

1. **[Feature Name 1]**
   - Description: [...]
   - Priority: Must Have
   - Implementation Difficulty: Low/Med/High

2. **[Feature Name 2]**
   - Description: [...]
   - Priority: Must Have
   - Implementation Difficulty: Low/Med/High

3. **[Feature Name 3]**
   - Description: [...]
   - Priority: Should Have
   - Implementation Difficulty: Low/Med/High

### 4-2. UI Design

#### Main Window
- **Size**: Width xxxx × Height xxxx (Default)
- **Minimum Size**: Width xxx × Height xxx
- **Resizable**: Yes / No
- **Frame**: Standard / Custom (frameless)

#### Menu Configuration
| Menu | Submenu |
|------|---------|
| File | New, Open, Save, Exit |
| Edit | Undo, Redo, Cut, Copy, Paste |
| View | Zoom, Fullscreen |
| Help | About, Documentation |

#### System Tray (If applicable)
- [ ] Resides in tray
- Tray Icon: [Description]
- Tray Menu: [Menu items]

#### Keyboard Shortcuts
| Shortcut | Action | Mac | Windows |
|----------|--------|-----|---------|
| Create New | New File | Cmd+N | Ctrl+N |
| Save | Save File | Cmd+S | Ctrl+S |
| ... | ... | ... | ... |

### 4-3. Data Design

#### User Data
- **Storage Location**: `app.getPath('userData')`
- **Format**: JSON / SQLite / electron-store
- **Content**: [Types of data to save]

#### Configuration Data
- **Storage Location**: `app.getPath('userData')/config.json`
- **Settings**: [...]

#### Cache
- **Storage Location**: `app.getPath('cache')`
- **Content**: [...]

---

## 5. Architecture Design

### 5-1. Process Configuration

```
Main Process
├── Window Management (BrowserWindow)
├── File System Operations (fs, dialog)
├── System Tray (Tray)
├── Menus (Menu)
├── IPC Handling (ipcMain)
└── Auto-Updates (autoUpdater)

Renderer Process
├── UI Rendering (React/Vue/etc.)
├── User Interaction Handling
└── IPC Calls (ipcRenderer via preload)

Preload Script
└── Safe API Exposure (contextBridge)
```

### 5-2. Security Settings

```javascript
// BrowserWindow settings
const mainWindow = new BrowserWindow({
  width: 1200,
  height: 800,
  webPreferences: {
    nodeIntegration: false,      // Required: false
    contextIsolation: true,      // Required: true
    sandbox: true,               // Recommended: true
    preload: path.join(__dirname, 'preload.js')
  }
});
```

### 5-3. IPC Design

#### Main Process → Renderer
```javascript
// main.js
mainWindow.webContents.send('channel-name', data);

// preload.js (Expose API for receiving)
contextBridge.exposeInMainWorld('api', {
  onChannelName: (callback) => ipcRenderer.on('channel-name', callback)
});
```

#### Renderer → Main Process
```javascript
// preload.js
contextBridge.exposeInMainWorld('api', {
  doSomething: (data) => ipcRenderer.invoke('do-something', data)
});

// main.js
ipcMain.handle('do-something', async (event, data) => {
  // Processing
  return result;
});
```

### 5-4. Data Storage Design

| Data Type | Storage Method | Notes |
|-----------|----------------|-------|
| User Settings | electron-store | JSON format, encryption option available |
| Documents | fs (User selected) | Safely via dialogs |
| Cache | fs (cache dir) | Temporary data |
| DB | SQLite (better-sqlite3) | For structured data |

---

## 6. Technical Stack

### Core Technology
- **Electron**: Latest LTS version (v2X.x.x)
- **Node.js**: Latest LTS version
- **Framework**: React / Vue / Svelte / Vanilla

### UI/Styling
- **UI Library**: shadcn/ui / Radix UI / Ant Design
- **Styling**: Tailwind CSS / CSS Modules / styled-components

### Database/Storage
- **Settings**: electron-store
- **Local DB**: better-sqlite3 / sql.js

### Build and Distribution
- **Build Tool**: electron-builder / electron-forge
- **Auto-Update**: electron-updater
- **CI/CD**: GitHub Actions

### Selection Rationale
| Technology | Rationale | Alternatives |
|------------|-----------|--------------|
| TypeScript | Type safety, maintainability | JavaScript |
| React | Ecosystem, talent pool | Vue, Svelte |
| electron-builder | Feature-rich, proven track record | electron-forge |
| ... | ... | ... |

---

## 7. Development Roadmap

### Phase 1: MVP Development (1–2 Months)
- **Weeks 1-2**: Environment setup, basic window, IPC design
- **Weeks 3-6**: Core feature implementation
- **Weeks 7-8**: Testing, debugging

**Milestone**: Single-OS version verification

### Phase 2: Cross-Platform Support (2–4 Weeks)
- Cross-platform testing
- OS-specific adjustments (menus, paths, etc.)
- Installer creation
- Code signing

**Milestone**: Build for all operating systems complete

### Phase 3: Distribution and Improvement (Post-release)
- Distribution channel launch
- Auto-update functionality
- User feedback response
- Feature additions

---

## 8. Distribution Strategy

### Distribution Channels
- [ ] Own website
- [ ] GitHub Releases
- [ ] Microsoft Store
- [ ] Mac App Store

### Code Signing

#### Windows
- **Certificate**: EV Code Signing Certificate
- **Provider**: DigiCert, Sectigo, etc.
- **Purpose**: Avoid SmartScreen warnings, improve trust

#### macOS
- **Certificate**: Apple Developer ID
- **Notarization**: Required (macOS 10.15+)
- **Hardened Runtime**: Enabling is required

### Auto-Update Design

```javascript
// electron-updater settings
const { autoUpdater } = require('electron-updater');

autoUpdater.checkForUpdatesAndNotify();

autoUpdater.on('update-available', (info) => {
  // Show update notification UI
});

autoUpdater.on('update-downloaded', (info) => {
  // Show restart prompt UI
});
```

- **Update Server**: GitHub Releases / S3 / Own server
- **Update Frequency**: Automatic background / Manual check

---

## 9. Risks and Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Electron Update Support | Med | Regular updates, monitoring breaking changes |
| Store Review Rejection | High | Guideline compliance, pre-submission checks |
| Performance Issues | Med | Profiling, optimization, consider Native Modules |
| Security Vulnerabilities | High | `contextIsolation` mandatory, update dependencies |
| Cross-Platform Compatibility | Med | Continuous testing on all operating systems |

---

## 10. KPI Settings

### 1 Month Post-release
- Number of Downloads: XXX
- Active Users: XXX
- Crash Rate: X% or less

### 3 Months Post-release
- Number of Downloads: X,XXX
- Conversion Rate: X% (if applicable)
- User Satisfaction: X.X/5.0

---

## 11. Next Steps

### Immediate Actions
1. [ ] Set up development environment
2. [ ] Prototype basic window
3. [ ] Create UI design (Figma, etc.)

### Preparation Before Distribution
1. [ ] Obtain code signing certificates
2. [ ] Create privacy policy
3. [ ] Create website/landing page
4. [ ] Test installer

---

## Appendix

### References
- [Electron Official Documentation](https://www.electronjs.org/docs/latest/)
- [Electron Security Best Practices](https://www.electronjs.org/docs/latest/tutorial/security)
- [electron-builder](https://www.electron.build/)
- [URL of similar apps]

### Related Documents
- Design Mockups: [Link]
- Technical Specifications: [Link]
```

## Tips for Using the Template

### 1. Executive Summary
- Clarify why a desktop app is suitable.
- Emphasize differentiation points from Web apps.

### 2. Architecture Design
- Always verify security settings.
- Describe IPC design in detail.

### 3. Distribution Strategy
- Consider code signing as mandatory.
- Include auto-update design.

### 4. Cross-Platform
- Consider characteristics of each OS.
- Include a testing plan.
