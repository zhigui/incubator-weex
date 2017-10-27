/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND,  either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

/**
 * @fileoverview waterfall
 * NOTE: only support full screen width waterfall.
 */
import { extractComponentStyle, createEventMap } from '../../core'
import { scrollable } from '../../mixins'

const DEFAULT_COLUMN_COUNT = 1

export default {
  mixins: [scrollable],
  props: {
    /**
     * specified gap size.
     * value can be number or 'normal'. 'normal' (32px) by default.
     */
    columnGap: {
      type: [String, Number],
      default: 'normal',
      validator (val) {
        if (!val || val === 'normal') {
          return true
        }
        val = parseInt(val)
        return !isNaN(val) && val > 0
      }
    },
    /**
     * the maximum column counts.
     * value can be number or 'auto'. 1 by default.
     */
    columnCount: {
      type: [String, Number],
      default: DEFAULT_COLUMN_COUNT,
      validator (val) {
        val = parseInt(val)
        return !isNaN(val) && val > 0
      }
    },
    /**
     * the mimimum column width.
     * value can be number or 'auto'. 'auto' by default.
     */
    columnWidth: {
      type: [String, Number],
      default: 'auto',
      validator (val) {
        if (!val || val === 'auto') {
          return true
        }
        val = parseInt(val)
        return !isNaN(val) && val > 0
      }
    }
  },
  methods: {
    _createChildren (h, rootStyle) {
      const slots = this.$slots.default || []
      this._headers = []
      this._others = []
      this._footers = []
      this._cells = slots.filter(vnode => {
        if (!vnode.tag || !vnode.componentOptions) return false
        const tag = vnode.componentOptions.tag
        if (tag === 'refresh' || tag === 'loading') {
          this[`_${tag}`] = vnode
          return false
        }
        if (tag === 'header') {
          if (vnode.data.attrs && vnode.data.attrs['data-type'] === 'footer') {
            this._footers.push(vnode)
          }
          else {
            this._headers.push(vnode)
          }
          return false
        }
        if (tag !== 'cell') {
          this._others.push(vnode)
          return false
        }
        return true
      })
      // this._reCalc(rootStyle)
      // this._genColumns(h)
      this._genList(h)
      let children = []
      this._refresh && children.push(this._refresh)
      children = children
        .concat(this._headers)
        .concat(this._others)
      children.push(h('html:div', {
        staticStyle: {
          display: 'block',
          dtaticClass: 'xcf-waterfall-list'
        }
      }, this._listCells))
      children = children.concat(this._footers)
      this._loading && children.push(this._loading)
      return [
        h('html:div', {
          ref: 'inner',
          staticClass: 'weex-waterfall-inner weex-ct'
        }, children)
      ]
    },
    _genList (createElement) {
      this._listCells = []
      const cells = this._cells
      const columnCnt = this.columnCount
      const len = cells.length
      for (let i = 0; i < len; i++) {
        this._listCells.push(createElement('html:div', {
          staticStyle: {
            display: 'inline-block',
            width: 100 / columnCnt + '%',
            zoom: 1,
            letterSpacing: 'normal',
            verticalAlign: 'top',
            textRendering: 'auto',
            float: 'left'
          }
        }, [cells[i]]))
      }
    },
    _reLayoutChildren () {
      /**
       * treat the shortest column bottom as the match standard.
       * whichever cell exceeded it would be rearranged.
       * 1. m = shortest column bottom.
       * 2. get all cell ids who is below m.
       * 3. calculate which cell should be in which column.
       */
      const columnCnt = this._columnCount
      const columnDoms = []
      const columnAppendFragments = []
      const columnBottoms = []
      let minBottom = Number.MAX_SAFE_INTEGER
      let minBottomColumnIndex = 0

      // 1. find the shortest column bottom.
      for (let i = 0; i < columnCnt; i++) {
        const columnDom = this._columns[i].elm
        const lastChild = columnDom.lastElementChild
        const bottom = lastChild ? lastChild.getBoundingClientRect().bottom : 0
        columnDoms.push(columnDom)
        columnBottoms[i] = bottom
        columnAppendFragments.push(document.createDocumentFragment())
        if (bottom < minBottom) {
          minBottom = bottom
          minBottomColumnIndex = i
        }
      }

      // 2. get all cell ids who is below m.
      const belowCellIds = []
      const belowCells = {}
      for (let i = 0; i < columnCnt; i++) {
        if (i === minBottomColumnIndex) {
          continue
        }
        const columnDom = columnDoms[i]
        const cellsInColumn = columnDom.querySelectorAll('section.weex-cell')
        const len = cellsInColumn.length
        for (let j = len - 1; j >= 0; j--) {
          const cellDom = cellsInColumn[j]
          const cellRect = cellDom.getBoundingClientRect()
          if (cellRect.top > minBottom) {
            const id = ~~cellDom.getAttribute('data-cell')
            belowCellIds.push(id)
            belowCells[id] = { elm: cellDom, height: cellRect.height }
            columnBottoms[i] -= cellRect.height
          }
        }
      }

      // 3. calculate which cell should be in which column and rearrange them
      //  in the dom tree.
      belowCellIds.sort(function (a, b) { return a > b })
      const cellIdsLen = belowCellIds.length
      function addToShortestColumn (belowCell) {
        // find shortest bottom.
        minBottom = Math.min(...columnBottoms)
        minBottomColumnIndex = columnBottoms.indexOf(minBottom)
        const { elm: cellElm, height: cellHeight } = belowCell
        columnAppendFragments[minBottomColumnIndex].appendChild(cellElm)
        columnBottoms[minBottomColumnIndex] += cellHeight
      }
      for (let i = 0; i < cellIdsLen; i++) {
        addToShortestColumn(belowCells[belowCellIds[i]])
      }
      for (let i = 0; i < columnCnt; i++) {
        columnDoms[i].appendChild(columnAppendFragments[i])
      }
    },

    handleListScroll (event) {
      this.handleScroll(event)

      if (weex.utils.supportSticky()) {
        return
      }

      const scrollTop = this.$el.scrollTop
      const h = this.$children.filter(vm => {
        // only apply sticky to a header element with a data-sticky attr
        return vm.$refs.header && vm.$attrs && vm.$attrs['data-sticky']
      })

      if (h.length <= 0) {
        return
      }

      for (let i = 0; i < h.length; i++) {
        if (h[i].initTop < scrollTop) {
          h[i].addSticky()
        }
        else {
          h[i].removeSticky()
        }
      }
    }
  },
  render (createElement) {
    this.weexType = 'waterfall'
    this._cells = this.$slots.default || []
    this.$nextTick(() => {
      this.updateLayout()
    })
    this._renderHook()
    const mergedStyle = extractComponentStyle(this)
    return createElement('main', {
      ref: 'wrapper',
      attrs: { 'weex-type': 'waterfall' },
      on: createEventMap(this, {
        scroll: this.handleListScroll,
        touchstart: this.handleTouchStart,
        touchmove: this.handleTouchMove,
        touchend: this.handleTouchEnd
      }),
      staticClass: 'weex-waterfall weex-waterfall-wrapper weex-ct',
      staticStyle: mergedStyle
    }, this._createChildren(createElement, mergedStyle))
  }
}
