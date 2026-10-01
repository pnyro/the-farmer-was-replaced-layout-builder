import { createContext, useContext, useSyncExternalStore } from "react";

export const EditorContext = createContext(null);

export const useEditor = () => useContext(EditorContext);

/** Subscribe a component to a slice of editor state. */
export const useEditorState = (selector) => {
  const editor = useContext(EditorContext);
  return useSyncExternalStore(editor.subscribe, () => selector(editor.getState()));
};
