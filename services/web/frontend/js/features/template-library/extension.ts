import { EditorView, ViewPlugin } from '@codemirror/view'

export const templateInsertion = () =>
  ViewPlugin.define(view => {
    const handler = (event: Event) => {
      const content = (event as CustomEvent<{ content?: unknown }>).detail?.content
      if (typeof content !== 'string' || !view.dom.isConnected) return
      view.dispatch(view.state.replaceSelection(content))
      view.focus()
    }

    window.addEventListener('ui:insert-template', handler)
    return {
      destroy() {
        window.removeEventListener('ui:insert-template', handler)
      },
    }
  })
