import { defineComponent, h } from 'vue'
export default defineComponent({
  name: 'ImageIcon',
  props: { class: { type: String, default: '' } },
  setup(props) {
    return () => h('svg', { viewBox:'0 0 24 24', class: props.class, 'aria-hidden':'true', fill:'currentColor' }, [
      h('rect',   { x:'3', y:'4', width:'18', height:'16', rx:'2', opacity:'0.82' }),
      h('circle', { cx:'9', cy:'9', r:'2.2', fill:'rgba(0,0,0,0.28)' }),
      h('path',   { d:'M4.5 17.5 10 12l3 3 3.5-3.5L20.5 17.5z', fill:'rgba(0,0,0,0.35)' })
    ])
  }
})
