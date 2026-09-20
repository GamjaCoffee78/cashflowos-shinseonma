'use client'

import { useEffect, useState } from 'react'

// 🙈 Hide money — the shoulder-surfing switch.
//
// One tap turns every RM figure on the page into RM ✱✱✱✱✱; another brings them
// back. For screen-sharing, a meeting, a café table, the train.
//
// It is a CURTAIN, NOT A LOCK. Anyone who can open the app can tap it back on,
// and the figures are still in the page underneath. To actually keep sales away
// from someone, they need their own passcode — a different job (ask for it).
//
// Why it works by rewriting text rather than by every tab asking "am I hidden?":
// money is printed in 66 places across 15 files by ONE formatter, rm(). Masking
// here covers all of them, and covers any tab added later, with no change to the
// pages themselves — nothing to forget, nothing to keep in step.
//
// The choice is remembered per device (localStorage), never sent to the server,
// and OFF by default: a fresh browser always shows the real numbers.
const KEY = 'okmaya_hide_money'
// A NON-BREAKING space and four stars: with a normal space the big Stat
// tiles broke 'RM' onto its own line and the stars onto the next.
const STARS = 'RM\u00A0✱✱✱✱'
// "RM 1,306,292.78" · "RM 509,640.26" · "-RM 33,175.20" · "RM 0.00"
const MONEY = /-?RM\s?-?[\d,]+(?:\.\d{1,2})?/g

// The text each node had before masking, so putting it back is exact.
const original = new WeakMap<Text, string>()

function walk(root: Element, mask: boolean) {
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  for (let n = tw.nextNode(); n; n = tw.nextNode()) nodes.push(n as Text)
  for (const node of nodes) {
    if (node.parentElement?.closest('[data-keep-money]')) continue   // the toggle's own label
    if (mask) {
      const text = node.nodeValue ?? ''
      if (!MONEY.test(text)) { MONEY.lastIndex = 0; continue }
      MONEY.lastIndex = 0
      if (!original.has(node)) original.set(node, text)
      node.nodeValue = text.replace(MONEY, STARS)
    } else {
      const was = original.get(node)
      if (was != null) { node.nodeValue = was; original.delete(node) }
    }
  }
}

export default function PrivateEyes() {
  const [hidden, setHidden] = useState(false)
  const [ready, setReady] = useState(false)

  // Read the remembered choice AFTER mount: the server has no idea what this
  // browser prefers, so deciding during render would mismatch what it sent.
  useEffect(() => {
    try { setHidden(localStorage.getItem(KEY) === '1') } catch { /* private window */ }
    setReady(true)
  }, [])

  useEffect(() => {
    if (!ready) return
    const main = document.querySelector('main')
    if (!main) return
    try { localStorage.setItem(KEY, hidden ? '1' : '0') } catch { /* private window */ }

    walk(main, hidden)
    if (!hidden) return

    // React repaints when a tab loads or Sync refreshes, which writes the real
    // figures back in. Re-mask whatever it just drew, on the next frame so one
    // burst of changes costs one pass.
    let queued = 0
    const observer = new MutationObserver(() => {
      if (queued) return
      queued = requestAnimationFrame(() => { queued = 0; walk(main, true) })
    })
    observer.observe(main, { childList: true, subtree: true, characterData: true })
    return () => { observer.disconnect(); if (queued) cancelAnimationFrame(queued) }
  }, [hidden, ready])

  return (
    <button
      type="button"
      className="btn ghost"
      data-keep-money
      aria-pressed={hidden}
      onClick={() => setHidden(h => !h)}
      title={hidden ? 'Confidential — tap to show the figures again' : 'Turn every RM figure into stars'}
    >
      {hidden ? '🔒 Confidential' : '🙈 Hide money'}
    </button>
  )
}
