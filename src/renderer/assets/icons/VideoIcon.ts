import { defineComponent, h } from 'vue'
export default defineComponent({
  name: 'VideoIcon',
  props: { class: { type: String, default: '' } },
  setup(props) {
    return () => h('svg', { viewBox:'0 0 24 24', class: props.class, 'aria-hidden':'true', fill:'currentColor' }, [
      h('rect', { x:'3', y:'6', width:'14', height:'12', rx:'2', opacity:'0.82' }),
      h('path', { d:'M17 10.5 22 8v8l-5-2.5z', opacity:'0.95' }),
      h('path', { d:'M8.8 12.2 11.8 14l-3 .8z', fill:'rgba(0,0,0,0.25)' })
    ])
  }
})
