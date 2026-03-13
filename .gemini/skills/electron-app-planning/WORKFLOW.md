# Execution Workflow

This document explains the detailed execution procedures for the Desktop App (Electron) Planning Skill.

## Execution Steps

### 1. Initial Hearing

Collect the following information from the user:

#### Essential Items

- **App Theme/Domain**: What area (productivity, creative, dev tools, utility, etc.)
- **Problems to Solve**: What user problems the app addresses
- **Target Platforms**: Windows / macOS / Linux (multiple selections possible)
- **Distribution Method**: Own website / Microsoft Store / Mac App Store / Internal distribution

#### Optional Items

- **Target Users**: Assumed user base
- **Monetization Model**: One-time purchase / Subscription / Freemium / Free
- **Native Feature Requirements**: File system, system tray, global shortcuts, etc.
- **Reference Apps**: Desktop apps used as reference
- **Offline Support**: Requirements for operating without internet connection

### 2. Idea Brainstorming

#### 2-1. Deep Dive into Usage Scenes

- Persona setting (concrete user images)
- Desktop workflow analysis
- Reasons why a desktop app is suitable instead of a Web app

#### 2-2. Idea Divergence

- Propose 3-5 patterns of app concepts
- Uniqueness of each idea
- Differentiation from Web/mobile apps

### 3. Market and Competitive Analysis

#### 3-1. Research of Competing Apps

- Research similar desktop apps using WebSearch
- Analyze competitors' features, pricing, and reputation
- Identify differentiation points

#### 3-2. Market Analysis by Platform

- Windows market size and characteristics
- macOS market size and characteristics
- Linux market size and characteristics (if necessary)

### 4. Functional Design (MVP)

#### 4-1. Core Feature Definition

- Must Have features: Narrow down to 3-5
- Should Have features
- Nice to Have features

#### 4-2. UI/UX Design

- Main window design (size, resizability)
- Menu bar / Context menus
- System tray integration
- Keyboard shortcuts
- Compliance with OS-specific UI guidelines

#### 4-3. Data Design

- Local data storage (SQLite, JSON, `electron-store`, etc.)
- Cloud synchronization (if necessary)
- Configuration file storage locations

### 5. Architecture and Security Design

#### 5-1. Process Design

| Process | Responsibility |
|---------|----------------|
| Main Process | Window management, file operations, system integration |
| Renderer Process | UI rendering, user interaction handling |
| Preload Script | Safe API exposure (`contextBridge`) |

#### 5-2. Security Design

```javascript
// Mandatory security settings
{
  webPreferences: {
    nodeIntegration: false,      // Mandatory
    contextIsolation: true,      // Mandatory
    sandbox: true,               // Recommended
    preload: path.join(__dirname, 'preload.js')
  }
}
```

#### 5-3. IPC (Inter-Process Communication) Design

- Communication design between Main and Renderer
- Safe API exposure via preload script
- Validation of input values

#### 5-4. Native Feature Design

| Feature | API Used | Notes |
|---------|----------|-------|
| File Operations | fs (via preload) | Dialogs recommended |
| System Tray | Tray | For background/utility apps |
| Notifications | Notification | OS notification integration |
| Global Shortcuts | globalShortcut | Use with caution |
| Auto-Launch | `app.setLoginItemSettings` | Option in settings |

### 6. Distribution and Update Strategy

#### 6-1. Build and Packaging

- Build tool: `electron-builder` / `electron-forge`
- Code signing (Windows/macOS)
- OS-specific installers

| OS | Installer Format |
|----|------------------|
| Windows | NSIS (.exe) / MSI / AppX |
| macOS | DMG / PKG / Mac App Store |
| Linux | AppImage / deb / rpm / snap |

#### 6-2. Auto-Updates

- `electron-updater` settings
- Selection of update server (GitHub Releases, S3, etc.)
- Update notification UI

#### 6-3. Distribution Channels

- Own website
- GitHub Releases
- Microsoft Store application
- Mac App Store application (Sandboxing requirement)

### 7. Implementation Roadmap Creation

#### 7-1. Phase 1: MVP Development (1–2 Months)

- Implementation of core features
- Basic UI
- Verification on a single platform

#### 7-2. Phase 2: Cross-Platform Support (2–4 Weeks)

- Testing on all platforms
- OS-specific adjustments
- Installer creation
- Code signing

#### 7-3. Phase 3: Distribution and Improvement (Post-release)

- Launch on distribution channels
- Auto-update functionality
- Response to user feedback

### 8. Planning Document Creation and Storage

Summarize all analysis and design contents into a planning document:

1. Generate an appropriate filename (e.g., `electron-app-plans/markdown-editor.md`)
2. Save the planning document in the `electron-app-plans/` directory
3. Notify the user of the file path

### 9. Proposal of Next Steps

After completing the planning, propose the following actions:

- **Prototyping**: Creation of basic windows
- **Technical Verification**: Checking operation of native features
- **Design**: Creation of UI mockups (Figma, etc.)
- **Start Development**: Begin coding
- **Signing Preparation**: Obtaining code signing certificates

## Execution Example

### User Input Example

```
I want to create a Markdown editor.
It should have real-time preview and be able to edit local files.
I want it to run on Windows and macOS.
```

### Execution Flow

1. Initial hearing (Additional questions: distribution method, monetization model)
2. Idea brainstorming (Propose 3 patterns)
3. Research competitors for the selected idea (Using WebSearch)
4. Functional design (MVP: Editor, Preview, File Save)
5. Architecture design (IPC, Security)
6. Development roadmap creation (6-week plan)
7. Save planning document to `electron-app-plans/markdown-editor.md`
8. Propose next steps (Prototype creation, UI design)
