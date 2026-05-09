import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

const resources = {
  en: {
    common: {
      appName: "MediaManager",
      settings: "Settings",
      ready: "Ready",
      cancel: "Cancel",
      confirm: "Confirm",
      delete: "Delete",
      move: "Move",
      copy: "Copy",
      create: "Create",
      rename: "Rename",
      save: "Save",
      close: "Close",
    },
    folders: {
      title: "Folders",
      loading: "Loading roots...",
    },
    libraries: {
      title: "Libraries",
      new: "New Library",
      noLibraries: "No libraries yet",
      created: "Library created",
      renamed: "Library renamed",
      deleted: "Library deleted",
    },
    inspector: {
      title: "Inspector",
      summary: "Folder Summary",
      noSelection: "No folder selected",
      selectItem: "Select an item to see details",
      properties: "Properties",
      camera: "Camera Settings",
      location: "Location",
      actions: "Actions",
    },
    settings: {
      title: "Settings",
      general: "General",
      library: "Library",
      performance: "Performance",
      updates: "Updates",
      about: "About",
      language: "Language",
      theme: "Theme",
      mapPreview: "Map Preview",
      confirmDelete: "Confirm Delete",
    },
  },
  el: {
    common: {
      appName: "MediaManager",
      settings: "Ρυθμίσεις",
      ready: "Έτοιμο",
      cancel: "Ακύρωση",
      confirm: "Επιβεβαίωση",
      delete: "Διαγραφή",
      move: "Μετακίνηση",
      copy: "Αντιγραφή",
      create: "Δημιουργία",
      rename: "Μετονομασία",
      save: "Αποθήκευση",
      close: "Κλείσιμο",
    },
    folders: {
      title: "Φάκελοι",
      loading: "Φόρτωση...",
    },
    libraries: {
      title: "Βιβλιοθήκες",
      new: "Νέα Βιβλιοθήκη",
      noLibraries: "Δεν υπάρχουν βιβλιοθήκες",
    },
    inspector: {
      title: "Επιθεωρητής",
      summary: "Σύνοψη Φακέλου",
      properties: "Ιδιότητες",
      camera: "Ρυθμίσεις Κάμερας",
      location: "Τοποθεσία",
      actions: "Ενέργειες",
    },
  },
  sq: {
    common: {
      appName: "MediaManager",
      settings: "Cilësimet",
      ready: "Gati",
      cancel: "Anulo",
      confirm: "Konfirmo",
      delete: "Fshi",
      move: "Lëviz",
      copy: "Kopjo",
      create: "Krijo",
      rename: "Riemëro",
      save: "Ruaj",
      close: "Mbyll",
    },
    folders: {
      title: "Dosjet",
      loading: "Po ngarkohet...",
    },
    libraries: {
      title: "Bibliotekat",
      new: "Bibliotekë e re",
      noLibraries: "Nuk ka biblioteka ende",
    },
    inspector: {
      title: "Inspektori",
      summary: "Përmbledhja e dosjes",
      properties: "Karakteristikat",
      camera: "Cilësimet e kamerës",
      location: "Vendndodhja",
      actions: "Veprimet",
    },
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    ns: ["common", "folders", "libraries", "inspector", "dialogs", "errors", "settings"],
    defaultNS: "common",
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
