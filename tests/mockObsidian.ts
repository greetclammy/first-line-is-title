/**
 * Mock implementation of Obsidian API for testing
 * This file replaces the 'obsidian' module in tests
 */

import { vi } from "vitest";

// Mock TFile class
export class TFile {
  path: string;
  basename: string;
  extension: string;
  name: string;
  stat: { mtime: number; ctime: number; size: number };
  vault: any;
  parent: TFolder | null;

  constructor(path: string = "test.md") {
    this.path = path;
    this.basename =
      path
        .replace(/\.[^/.]+$/, "")
        .split("/")
        .pop() || "";
    this.extension = path.split(".").pop() || "md";
    this.name = path.split("/").pop() || "";
    this.stat = { mtime: Date.now(), ctime: Date.now(), size: 0 };
    this.vault = null;
    this.parent = null;
  }
}

// Mock TFolder class
export class TFolder {
  path: string;
  name: string;
  children: (TFile | TFolder)[];
  parent: TFolder | null;
  vault: any;

  constructor(path: string = "test-folder") {
    this.path = path;
    this.name = path.split("/").pop() || "";
    this.children = [];
    this.parent = null;
    this.vault = null;
  }

  isRoot(): boolean {
    return this.path === "/";
  }
}

// Mock Vault class
export class Vault {
  adapter: any;
  configDir: string;

  constructor() {
    this.adapter = {
      getName: vi.fn().mockReturnValue("mock-vault"),
      exists: vi.fn().mockResolvedValue(true),
      read: vi.fn().mockResolvedValue(""),
      write: vi.fn().mockResolvedValue(undefined),
      mkdir: vi.fn().mockResolvedValue(undefined),
    };
    this.configDir = ".obsidian";
  }

  read = vi.fn().mockResolvedValue("");
  cachedRead = vi.fn().mockResolvedValue("");
  modify = vi.fn().mockResolvedValue(undefined);
  rename = vi.fn().mockResolvedValue(undefined);
  delete = vi.fn().mockResolvedValue(undefined);
  trash = vi.fn().mockResolvedValue(undefined);
  create = vi.fn().mockResolvedValue(new TFile());
  copy = vi.fn().mockResolvedValue(new TFile());
  getAbstractFileByPath = vi.fn((path: string) => {
    if (path.endsWith(".md")) return new TFile(path);
    return new TFolder(path);
  });
  getAllLoadedFiles = vi.fn().mockReturnValue([]);
  getMarkdownFiles = vi.fn().mockReturnValue([]);
  getFiles = vi.fn().mockReturnValue([]);
  on = vi.fn();
  off = vi.fn();
}

// Mock FileManager class
export class FileManager {
  vault: Vault;

  constructor(vault: Vault) {
    this.vault = vault;
  }

  renameFile = vi.fn().mockResolvedValue(undefined);
  generateMarkdownLink = vi.fn((file: TFile) => `[[${file.basename}]]`);
  processFrontMatter = vi.fn(async (file: TFile, fn: (fm: any) => void) => {
    const frontmatter = {};
    fn(frontmatter);
  });
  getNewFileParent = vi.fn((path: string) => new TFolder());
}

// Mock MetadataCache class
export class MetadataCache {
  getFileCache = vi.fn((file: TFile) => ({
    frontmatter: {},
    sections: [],
    headings: [],
    links: [],
    tags: [],
  }));
  getCache = vi.fn((path: string) => ({
    frontmatter: {},
    sections: [],
    headings: [],
    links: [],
    tags: [],
  }));
  on = vi.fn();
  off = vi.fn();
  trigger = vi.fn();
}

// Mock Workspace class
export class Workspace {
  activeLeaf: any;
  activeEditor: any;
  leftSplit: any;
  rightSplit: any;

  constructor() {
    this.activeLeaf = null;
    this.activeEditor = null;
    this.leftSplit = { collapsed: false };
    this.rightSplit = { collapsed: false };
  }

  getActiveFile = vi.fn().mockReturnValue(null);
  getActiveViewOfType = vi.fn().mockReturnValue(null);
  getLeaf = vi.fn();
  getLeavesOfType = vi.fn().mockReturnValue([]);
  getMostRecentLeaf = vi.fn().mockReturnValue(null);
  on = vi.fn();
  off = vi.fn();
  trigger = vi.fn();
  revealLeaf = vi.fn();
  setActiveLeaf = vi.fn();
  iterateAllLeaves = vi.fn();
  iterateRootLeaves = vi.fn();
  onLayoutReady = vi.fn((callback: () => void) => {
    callback();
  });
}

// Mock App class
export class App {
  vault: Vault;
  metadataCache: MetadataCache;
  workspace: Workspace;
  fileManager: FileManager;
  lastEvent: any;
  keymap: any;
  scope: any;
  commands: any;

  constructor() {
    this.vault = new Vault();
    this.metadataCache = new MetadataCache();
    this.workspace = new Workspace();
    this.fileManager = new FileManager(this.vault);
    this.lastEvent = null;
    this.keymap = {
      pushScope: vi.fn(),
      popScope: vi.fn(),
    };
    this.scope = {
      register: vi.fn(),
      unregister: vi.fn(),
    };
    this.commands = {
      commands: {},
    };
  }

  loadLocalStorage = vi.fn();
  saveLocalStorage = vi.fn();
}

// Mock Editor class
export class Editor {
  getValue = vi.fn().mockReturnValue("");
  setValue = vi.fn();
  getLine = vi.fn((line: number) => "");
  setLine = vi.fn();
  lineCount = vi.fn().mockReturnValue(0);
  lastLine = vi.fn().mockReturnValue(0);
  getSelection = vi.fn().mockReturnValue("");
  replaceSelection = vi.fn();
  replaceRange = vi.fn();
  getCursor = vi.fn().mockReturnValue({ line: 0, ch: 0 });
  setCursor = vi.fn();
  getRange = vi.fn().mockReturnValue("");
  somethingSelected = vi.fn().mockReturnValue(false);
  getDoc = vi.fn();
  refresh = vi.fn();
  focus = vi.fn();
}

// Mock MarkdownView class
export class MarkdownView {
  app: App;
  file: TFile | null;
  editor: Editor;
  containerEl: HTMLElement;

  constructor(app?: App) {
    this.app = app || new App();
    this.file = null;
    this.editor = new Editor();
    this.containerEl = document.createElement("div");
  }

  getViewType = vi.fn().mockReturnValue("markdown");
  getDisplayText = vi.fn().mockReturnValue("");
  getState = vi.fn().mockReturnValue({});
  setState = vi.fn();
  getEphemeralState = vi.fn().mockReturnValue({});
  setEphemeralState = vi.fn();
  onload = vi.fn();
  onunload = vi.fn();
}

// Mock Plugin class
export class Plugin {
  app: App;
  manifest: any;

  constructor() {
    this.app = new App();
    this.manifest = {
      id: "test-plugin",
      name: "Test Plugin",
      version: "1.0.0",
    };
  }

  loadData = vi.fn().mockResolvedValue({});
  saveData = vi.fn().mockResolvedValue(undefined);
  addCommand = vi.fn();
  addRibbonIcon = vi.fn();
  addStatusBarItem = vi.fn(() => document.createElement("div"));
  addSettingTab = vi.fn();
  registerEvent = vi.fn();
  registerDomEvent = vi.fn();
  registerInterval = vi.fn();
  register = vi.fn();
  onload = vi.fn();
  onunload = vi.fn();
}

// Mock Notice class
export class Notice {
  message: string;
  timeout: number;

  constructor(message: string, timeout?: number) {
    this.message = message;
    this.timeout = timeout || 5000;
  }

  setMessage = vi.fn();
  hide = vi.fn();
}

// Mock Modal class
export class Modal {
  app: App;
  containerEl: HTMLElement;
  modalEl: HTMLElement;
  titleEl: HTMLElement;
  contentEl: HTMLElement;

  constructor(app: App) {
    this.app = app;
    this.containerEl = document.createElement("div");
    this.modalEl = document.createElement("div");
    this.titleEl = document.createElement("div");
    this.contentEl = document.createElement("div");
  }

  open = vi.fn();
  close = vi.fn();
  onOpen = vi.fn();
  onClose = vi.fn();
}

// Mock Setting class
export class Setting {
  settingEl: HTMLElement;
  infoEl: HTMLElement;
  nameEl: HTMLElement;
  descEl: HTMLElement;
  controlEl: HTMLElement;

  constructor(containerEl: HTMLElement) {
    this.settingEl = document.createElement("div");
    this.infoEl = document.createElement("div");
    this.nameEl = document.createElement("div");
    this.descEl = document.createElement("div");
    this.controlEl = document.createElement("div");
  }

  setName = vi.fn().mockReturnThis();
  setDesc = vi.fn().mockReturnThis();
  setHeading = vi.fn().mockReturnThis();
  setClass = vi.fn().mockReturnThis();
  setDisabled = vi.fn().mockReturnThis();
  addButton = vi.fn().mockReturnThis();
  addToggle = vi.fn().mockReturnThis();
  addText = vi.fn().mockReturnThis();
  addTextArea = vi.fn().mockReturnThis();
  addDropdown = vi.fn().mockReturnThis();
  addSlider = vi.fn().mockReturnThis();
  addExtraButton = vi.fn().mockReturnThis();
  then = vi.fn().mockReturnThis();
}

// Mock Menu class
export class Menu {
  addItem = vi.fn((cb: (item: any) => void) => {
    const item = {
      setTitle: vi.fn().mockReturnThis(),
      setIcon: vi.fn().mockReturnThis(),
      onClick: vi.fn().mockReturnThis(),
      setDisabled: vi.fn().mockReturnThis(),
      setChecked: vi.fn().mockReturnThis(),
      setSection: vi.fn().mockReturnThis(),
    };
    cb(item);
    return this;
  });
  addSeparator = vi.fn().mockReturnThis();
  showAtMouseEvent = vi.fn();
  showAtPosition = vi.fn();
  hide = vi.fn();
  onHide = vi.fn();
}

// Mock AbstractInputSuggest class
export class AbstractInputSuggest<T> {
  app: App;
  inputEl: HTMLInputElement;

  constructor(app: App, inputEl: HTMLInputElement) {
    this.app = app;
    this.inputEl = inputEl;
  }

  getSuggestions = vi.fn().mockReturnValue([]);
  renderSuggestion = vi.fn();
  selectSuggestion = vi.fn();
  close = vi.fn();
  open = vi.fn();
}

// Mock utility functions
export const normalizePath = vi.fn((path: string) => {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/");
});

export const setIcon = vi.fn((el: HTMLElement, icon: string) => {
  el.setAttribute("data-icon", icon);
});

export const getFrontMatterInfo = vi.fn(() => {
  // Default: no frontmatter (tests will mock specific return values)
  return {
    exists: false,
    frontmatter: "",
    contentStart: 0,
    lineStart: 0,
  };
});

export const parseYaml = vi.fn((yaml: string) => {
  try {
    return {};
  } catch {
    return null;
  }
});

export const stringifyYaml = vi.fn((obj: any) => {
  return "";
});

// Mock moment (from moment.js)
export const moment = Object.assign(
  vi.fn((date?: any) => {
    return {
      format: vi.fn().mockReturnValue("2024-01-01"),
      fromNow: vi.fn().mockReturnValue("a few seconds ago"),
      locale: vi.fn().mockReturnThis(),
      isValid: vi.fn().mockReturnValue(true),
    };
  }),
  {
    locale: vi.fn(),
    locales: vi.fn().mockReturnValue([]),
  },
);

// Mock platform detection
export const Platform = {
  isMobile: false,
  isDesktop: true,
  isMacOS: false,
  isWin: false,
  isLinux: true,
  isIosApp: false,
  isAndroidApp: false,
};

// Mock getLanguage function (added in Obsidian 1.8.0)
export const getLanguage = vi.fn().mockReturnValue("en");

// Mock request for web requests
export const request = vi.fn().mockResolvedValue("");
export const requestUrl = vi.fn().mockResolvedValue({
  status: 200,
  headers: {},
  arrayBuffer: new ArrayBuffer(0),
  json: {},
  text: "",
});

// Helper interface for ViewWithFileEditor
export interface ViewWithFileEditor {
  file: TFile | null;
  editor?: Editor;
}

// Export default mock app instance for convenience
export const mockApp = new App();
