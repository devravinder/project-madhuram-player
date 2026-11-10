import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { onAppStart } from "./services/initializer.ts";
const intialize = async () => {
  await onAppStart();
};

const startApp = async () => {
  await intialize();

  createRoot(document.getElementById("root")!).render(<App />);
};

startApp();
