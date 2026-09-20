import type { Coach, TopPost } from '@/lib/coach'

// "What's working" — the three best posts in the window, and three things to
// make next.
//
// It sits directly above Views by month because the two answer the same
// question at different zoom levels: the month chart says whether you're going
// up, this says WHICH posts took you there and what to do about it.
//
// The two halves are deliberately styled apart. The left is measured fact and
// carries real numbers; the right is a suggestion from a model and is labelled
// as one. Nobody should have to guess which is which.

const medal = ['1st', '2nd', '3rd']

function Post({ p, rank }: { p: TopPost; rank: number }) {
  const body = (
    <>
      <span className="cc-rank" aria-hidden="true">{medal[rank] ?? `${rank + 1}th`}</span>
      <span className="cc-title">{p.title}</span>
      <span className="cc-meta">
        <strong>{p.views.toLocaleString()}</strong> views
        {p.kept > 0 ? <> · {p.kept.toLocaleString()} saved &amp; shared</> : null}
        {p.account ? <> · @{p.account}</> : null}
      </span>
    </>
  )
  // The permalink is the whole point of a "top post" — you want to go and look
  // at it. Only linked when there is one, so a manually added row can't produce
  // a dead anchor.
  return p.permalink ? (
    <li className="cc-post">
      <a className="cc-link" href={p.permalink} target="_blank" rel="noopener noreferrer">{body}</a>
    </li>
  ) : (
    <li className="cc-post">{body}</li>
  )
}

export default function ContentCoach({ coach }: { coach: Coach }) {
  // No posts with numbers in the window — the page above already says the
  // window is empty, and repeating it here would just be noise.
  if (!coach.top.length) return null

  return (
    <section className="cc" aria-labelledby="cc-h">
      <h2 id="cc-h">What&rsquo;s working — last 90 days</h2>

      <div className="cc-grid">
        <div className="cc-col">
          <h3 className="cc-sub">Your top 3</h3>
          <ol className="cc-list">
            {coach.top.map((p, i) => <Post key={p.id} p={p} rank={i} />)}
          </ol>
        </div>

        <div className="cc-col">
          <h3 className="cc-sub">
            3 ideas to try
            <span className="cc-tag">suggested</span>
          </h3>

          {coach.ideas.length ? (
            <ol className="cc-list">
              {coach.ideas.map((idea, i) => (
                <li className="cc-idea" key={i}>
                  <span className="cc-head">{idea.headline}</span>
                  <span className="cc-why">{idea.why}</span>
                </li>
              ))}
            </ol>
          ) : (
            // Honest about the reason: the numbers on the left are real and
            // unaffected, and this half simply has nothing to show today.
            <p className="cc-none">
              No ideas today — these are generated once a day from the posts on the left,
              and need an Anthropic API key set.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
