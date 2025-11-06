import { defineComponent, h } from 'vue'

export default defineComponent({
  name: 'FolderIcon',
  props: { class: { type: String, default: '' } },
  setup(props) {
    return () =>
      h('svg', { xmlns:'http://www.w3.org/2000/svg', viewBox:'0 0 24 24', class: props.class, fill:'currentColor', 'aria-hidden':'true' }, [
        h('path', { d:'M10 4h.01c.89 0 1.73.39 2.3 1.06L13.7 6H20a2 2 0 0 1 2 2v1H2V6a2 2 0 0 1 2-2h6z' }),
        h('path', { d:'M2 9h20v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9z' })
      ])
  }
})
