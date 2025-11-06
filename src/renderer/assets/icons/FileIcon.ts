import { defineComponent, h } from 'vue'

export default defineComponent({
  name: 'FileIcon',
  props: { class: { type: String, default: '' } },
  setup(props) {
    return () => h('svg', { viewBox:'0 0 24 24', class: props.class, 'aria-hidden':'true' }, [
      h('path', { d:'M6 2h7.5L20 8.5V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z', fill:'currentColor', opacity:'0.85' }),
      h('path', { d:'M13.5 2V8a1 1 0 0 0 1 1H20', fill:'none', stroke:'rgba(0,0,0,0.22)', 'stroke-width':'1.25', 'stroke-linecap':'round' }),
      h('path', { d:'M13.5 2L20 8.5h-5.5a1 1 0 0 1-1-1V2z', fill:'currentColor', opacity:'0.98' }),
      h('rect', { x:'7.25', y:'11.25', width:'9.5', height:'1.2', rx:'0.6', fill:'rgba(0,0,0,0.28)' }),
      h('rect', { x:'7.25', y:'14', width:'9.5', height:'1.2', rx:'0.6', fill:'rgba(0,0,0,0.28)' }),
      h('rect', { x:'7.25', y:'16.75', width:'7',   height:'1.2', rx:'0.6', fill:'rgba(0,0,0,0.28)' }),
    ])
  }
})
