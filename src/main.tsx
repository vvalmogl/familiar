import React from "react";
import ReactDOM from "react-dom/client";
import Bar from "./windows/Bar";
import Character from "./windows/Character";
import Main from "./windows/Main";
import "./styles.css";

// One bundle, three windows: tauri.conf.json opens index.html#bar, #character and #main.
const which = window.location.hash.slice(1) || "main";
document.documentElement.dataset.window = which;
const View = which === "bar" ? Bar : which === "character" ? Character : Main;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <View />
  </React.StrictMode>,
);
