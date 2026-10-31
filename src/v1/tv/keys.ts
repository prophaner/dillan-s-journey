// Remote keys → TV actions (handoff §3 key map). Fire TV in Silk sends arrows/Enter as normal key
// events; Back may arrive as Escape/Backspace/GoBack/keyCode 4 or only as a history popstate (the
// app keeps a history guard, see tv-app.tsx). Play/Pause is MediaPlayPause (keyCode 179) and the
// Menu (☰) button ContextMenu/Menu (keyCode 93 or 82 on Android).

export type TvKey = "up" | "down" | "left" | "right" | "select" | "back" | "playpause" | "menu";

export function tvKeyOf(e: Pick<KeyboardEvent, "key" | "keyCode">): TvKey | null {
  switch (e.key) {
    case "ArrowUp":
      return "up";
    case "ArrowDown":
      return "down";
    case "ArrowLeft":
      return "left";
    case "ArrowRight":
      return "right";
    case "Enter":
    case "Select":
      return "select";
    case "Escape":
    case "Backspace":
    case "GoBack":
    case "BrowserBack":
      return "back";
    case "MediaPlayPause":
    case "MediaPlay":
    case "MediaPause":
      return "playpause";
    case "ContextMenu":
    case "Menu":
      return "menu";
  }
  switch (e.keyCode) {
    case 38:
      return "up";
    case 40:
      return "down";
    case 37:
      return "left";
    case 39:
      return "right";
    case 13:
    case 23: // Android DPAD_CENTER
      return "select";
    case 4: // Android BACK
    case 8:
    case 27:
      return "back";
    case 179:
    case 85: // Android MEDIA_PLAY_PAUSE
      return "playpause";
    case 82: // Android MENU
    case 93:
      return "menu";
  }
  return null;
}
