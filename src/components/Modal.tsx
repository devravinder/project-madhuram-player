import { type ReactNode, useState } from "react";
import { createPortal } from "react-dom";

const modalClass =
  "fixed inset-0 h-screen w-screen z-999 grid place-items-center bg-transparent backdrop-blur-xl transition-opacity duration-300";

export default function Modal({ children }: { children: ReactNode }) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  return (
    <div ref={setElement}>
      {element &&
        createPortal(<div className={modalClass}>{children}</div>, document.body)}
    </div>
  );
}
