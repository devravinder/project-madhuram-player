import React, { createContext, useContext, useRef } from "react";

type DevToolContextType = {
  toggleDevTools: () => void;
};

const DevToolContext = createContext<DevToolContextType | null>(null);

export const DevToolProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const erudaRef = useRef<any>(null);

  const codeModuleRef = useRef<any>(null);
  const indexModuleRef = useRef<any>(null);
  const defaultCodeRef = useRef<any>(null);

  const isVisibleRef = useRef(false);

  const importEruda = async () => {
    if (!erudaRef.current) {
      const erudaModule = await import("eruda");
      const indexeddbModule = await import("eruda-indexeddb");
      const codeModule = await import("eruda-code");
      const defaultCodeModule = await import("../services/debugUtil.js?raw");

      erudaRef.current = erudaModule.default;
      codeModuleRef.current = codeModule.default;
      indexModuleRef.current = indexeddbModule.default;
      defaultCodeRef.current = defaultCodeModule.default;
    }
  };

  const initEruda = () => {
    const eruda = erudaRef.current;
    const erudaCode = codeModuleRef.current;
    const indexeddb = indexModuleRef.current;

    eruda.init();
    eruda.add(indexeddb);
    eruda.add(erudaCode);
    eruda.show();

    setTimeout(addErudaDefaultCode, 10);
  };

  const destroyEruda = () => {
    // erudaRef.current.hide()
    erudaRef.current.destroy();
  };

  const addErudaDefaultCode = () => {
    const eruda = erudaRef.current;
    const codePlugin = eruda.get("code");
    const ele = codePlugin._$el[0] as HTMLElement;

    const textArea = ele.querySelector("textarea.eruda-editor");

    if (textArea?.innerHTML) textArea.innerHTML = defaultCodeRef.current;
  };

  const toggleDevTools = async () => {
    // First time load
    if (!erudaRef.current) {
      await importEruda();
    }

    if (isVisibleRef.current) {
      destroyEruda();
      isVisibleRef.current = false;
    } else {
      initEruda();
      isVisibleRef.current = true;
    }
  };

  return (
    <DevToolContext.Provider value={{ toggleDevTools }}>
      {children}
    </DevToolContext.Provider>
  );
};

export const useDevTools = () => {
  const context = useContext(DevToolContext);
  if (!context) {
    throw new Error("useDevTools must be used inside DevToolProvider");
  }
  return context;
};
