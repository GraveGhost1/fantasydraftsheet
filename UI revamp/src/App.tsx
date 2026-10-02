import { useMemo, useState, type ReactNode } from "react"

type IconName = "activity" | "arrow" | "chevron" | "grid" | "help" | "home" | "search" | "sparkles" | "swap" | "trend"

const iconPaths: Record<IconName, ReactNode> = {
  activity: (
    <>
      <path d="M3 12h4l2-6 4 12 2-6h6" />
    </>
  ),
  arrow: (
    <>
      <path d="m9 18 6-6-6-6" />
    </>
  ),
  chevron: (
    <>
      <path d="m6 9 6 6 6-6" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9a2.5 2.5 0 0 1 4.9.8c0 2-2.5 2.1-2.5 4.2" />
      <path d="M12 17.5h.01" />
    </>
  ),
  home: (
    <>
      <path d="m3 11 9-8 9 8" />
      <path d="M5 10v10h14V10M9 20v-6h6v6" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  sparkles: (
    <>
      <path d="m12 3 1.3 3.7L17 8l-3.7 1.3L12 13l-1.3-3.7L7 8l3.7-1.3L12 3Z" />
      <path d="m18.5 14 .7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3Z" />
    </>
  ),
  swap: (
    <>
      <path d="M7 7h11l-3-3M17 17H6l3 3" />
    </>
  ),
  trend: (
    <>
      <path d="m4 16 5-5 4 4 7-8" />
      <path d="M15 7h5v5" />
    </>
  ),
}

function Icon({ name, size = 18 }: { name: IconName size?: number }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <g
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      >
        {iconPaths[name]}
      </g>
    </svg>
  )
}

const players = [
  {
    rank: 1,
    name: "Bijan Robinson",
    team: "ATL",
    position: "RB",
    opponent: "vs TB",
    projection: 19.8,
    trend: 2,
    color: "#f05a45",
  },
  {
    rank: 2,
    name: "Jahmyr Gibbs",
    team: "DET",
    position: "RB",
    opponent: "vs KC",
    projection: 18.9,
    trend: -1,
    color: "#2994d1",
  },
  {
    rank: 3,
    name: "Ja'Marr Chase",
    team: "CIN",
    position: "WR",
    opponent: "@ CLE",
    projection: 18.2,
    trend: 1,
    color: "#f28b32",
  },
  {
    rank: 4,
    name: "Puka Nacua",
    team: "LAR",
    position: "WR",
    opponent: "vs SF",
    projection: 17.7,
    trend: 3,
    color: "#3166b1",
  },
  {
    rank: 5,
    name: "Christian McCaffrey",
    team: "SF",
    position: "RB",
    opponent: "@ LAR",
    projection: 17.1,
    trend: -2,
    color: "#d83542",
  },
  {
    rank: 6,
    name: "Amon-Ra St. Brown",
    team: "DET",
    position: "WR",
    opponent: "vs KC",
    projection: 16.8,
    trend: 0,
    color: "#2994d1",
  },
]

const positionOptions = ["All", "QB", "RB", "WR", "TE"]

function PlayerMark({
  player,
  large = false,
}: {
  player: typeof players[number]
  large?: boolean
}) {
  return (
    <span
      className={`player-mark ${large ? "player-mark-large" : ""}`}
      style={{ "--team": player.color } as React.CSSProperties}
    >
      {player.name
        .split(" ")
        .map((part) => part[0])
        .join("")
        .slice(0, 2)}
    </span>
  )
}

function Header({
  active,
  onNavigate,
}: {
  active: string
  onNavigate: (value: string) => void
}) {
  return (
    <header className="topbar">
      <button className="brand" onClick={() => onNavigate("Home")}>
        <span className="brand-mark">G</span>
        <span>Ghost</span>
        <span className="brand-suffix">Fantasy</span>
      </button>
      <nav aria-label="Primary navigation" className="desktop-nav">
        {["Home", "Rankings", "Start / Sit", "My Team"].map((item) => (
          <button
            className={active === item ? "nav-link active" : "nav-link"}
            key={item}
            onClick={() => onNavigate(item)}
          >
            {item}
          </button>
        ))}
      </nav>
      <div className="header-actions">
        <button aria-label="Help" className="icon-button">
          <Icon name="help" />
        </button>
        <button className="profile">
          <span>JD</span>
          <b>Josh</b>
          <Icon name="chevron" size={14} />
        </button>
      </div>
    </header>
  )
}

function MobileNav({
  active,
  onNavigate,
}: {
  active: string
  onNavigate: (value: string) => void
}) {
  const links: [string, IconName][] = [
    ["Home", "home"],
    ["Rankings", "grid"],
    ["Start / Sit", "swap"],
    ["My Team", "activity"],
  ]
  return (
    <nav aria-label="Mobile navigation" className="mobile-nav">
      {links.map(([label, icon]) => (
        <button
          className={active === label ? "active" : ""}
          key={label}
          onClick={() => onNavigate(label)}
        >
          <Icon name={icon} size={19} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  )
}

function Rankings() {
  const [position, setPosition] = useState("All")
  const [query, setQuery] = useState("")
  const visiblePlayers = useMemo(
    () =>
      players.filter(
        (player) =>
          (position === "All" || player.position === position) &&
          player.name.toLowerCase().includes(query.toLowerCase()),
      ),
    [position, query],
  )

  return (
    <section className="panel rankings-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Consensus board</span>
          <h2>Week 4 rankings</h2>
        </div>
        <button className="text-button">
          View full rankings <Icon name="arrow" size={15} />
        </button>
      </div>
      <div className="ranking-tools">
        <div
          className="filter-row"
          role="group"
          aria-label="Filter by position"
        >
          {positionOptions.map((option) => (
            <button
              className={position === option ? "filter active" : "filter"}
              key={option}
              onClick={() => setPosition(option)}
            >
              {option}
            </button>
          ))}
        </div>
        <label className="search-field">
          <Icon name="search" size={16} />
          <input
            aria-label="Search players"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search players"
            value={query}
          />
        </label>
      </div>
      <div className="ranking-labels" aria-hidden="true">
        <span>Rank / player</span>
        <span>Matchup</span>
        <span>Projected</span>
        <span>Trend</span>
      </div>
      <div className="ranking-list">
        {visiblePlayers.map((player) => (
          <button className="ranking-row" key={player.name}>
            <span className="rank">{player.rank}</span>
            <PlayerMark player={player} />
            <span className="player-name">
              <b>{player.name}</b>
              <small>
                {player.position} · {player.team}
              </small>
            </span>
            <span className="matchup">{player.opponent}</span>
            <span className="projection">
              <b>{player.projection}</b>
              <small>pts</small>
            </span>
            <span
              className={`trend ${
                player.trend > 0 ? "up" : player.trend < 0 ? "down" : ""
              }`}
            >
              {player.trend > 0 ? "↑" : player.trend < 0 ? "↓" : "—"}{" "}
              {Math.abs(player.trend) || ""}
            </span>
            <span className="row-arrow">
              <Icon name="arrow" size={16} />
            </span>
          </button>
        ))}
        {visiblePlayers.length === 0 && (
          <p className="empty-state">
            No players found. Try another position or search.
          </p>
        )}
      </div>
    </section>
  )
}

function MatchupSpotlight({ onOpen }: { onOpen: () => void }) {
  return (
    <aside className="panel spotlight">
      <div className="section-heading compact">
        <div>
          <span className="eyebrow">Matchup spotlight</span>
          <h2>Make the close call</h2>
        </div>
        <span className="live-pill">
          <i /> Live
        </span>
      </div>
      <p className="muted">
        Our model found a meaningful edge in one of this week's most compared
        matchups.
      </p>
      <div className="versus">
        <div className="versus-player">
          <PlayerMark large player={players[0]} />
          <b>Bijan Robinson</b>
          <span>RB · ATL</span>
          <strong>
            19.8 <small>pts</small>
          </strong>
        </div>
        <span className="vs">VS</span>
        <div className="versus-player">
          <PlayerMark
            large
            player={{
              ...players[1],
              name: "Breece Hall",
              team: "NYJ",
              color: "#2c8053",
            }}
          />
          <b>Breece Hall</b>
          <span>RB · NYJ</span>
          <strong>
            17.6 <small>pts</small>
          </strong>
        </div>
      </div>
      <div className="edge-note">
        <Icon name="sparkles" size={17} />
        <span>
          <b>2.2 point edge</b>
          <small>Robinson has the safer floor this week</small>
        </span>
      </div>
      <button className="primary-button wide" onClick={onOpen}>
        Compare players <Icon name="arrow" size={16} />
      </button>
    </aside>
  )
}

function Home({ onOpenStartSit }: { onOpenStartSit: () => void }) {
  return (
    <main className="page-shell">
      <section className="welcome">
        <div>
          <span className="eyebrow">Week 4 · Half-PPR</span>
          <h1>Your lineup, made clearer.</h1>
          <p>Rankings, projections, and matchup context—without the noise.</p>
        </div>
        <div className="week-control">
          <span>Current week</span>
          <button>
            Week 4 <Icon name="chevron" size={15} />
          </button>
        </div>
      </section>
      <section className="summary-grid">
        <article className="summary-card featured">
          <span className="summary-icon">
            <Icon name="sparkles" />
          </span>
          <div>
            <span>Lineup grade</span>
            <strong>
              87 <small>/ 100</small>
            </strong>
            <p>Strong outlook · 2 recommendations</p>
          </div>
          <Icon name="arrow" size={18} />
        </article>
        <article className="summary-card">
          <span className="summary-icon">
            <Icon name="trend" />
          </span>
          <div>
            <span>Projected total</span>
            <strong>126.4</strong>
            <p>
              <em>+7.2</em> vs opponent
            </p>
          </div>
        </article>
        <article className="summary-card">
          <span className="summary-icon">
            <Icon name="activity" />
          </span>
          <div>
            <span>Players active</span>
            <strong>
              9 <small>/ 9</small>
            </strong>
            <p>All starters are healthy</p>
          </div>
        </article>
      </section>
      <div className="content-grid">
        <section className="panel weekly-brief">
          <div className="section-heading">
            <div>
              <span className="eyebrow">This week</span>
              <h2>Three things to know</h2>
            </div>
            <span className="brief-count">2 actions</span>
          </div>
          <div className="brief-list">
            <button className="brief-row" onClick={onOpenStartSit}>
              <span className="brief-number">01</span>
              <span className="brief-copy">
                <b>Robinson has the edge over Hall</b>
                <small>
                  Better game environment and red-zone role · 82% confidence
                </small>
              </span>
              <span className="status-tag action">Review</span>
              <Icon name="arrow" size={16} />
            </button>
            <button className="brief-row">
              <span className="brief-number">02</span>
              <span className="brief-copy">
                <b>Consider Puka Nacua in your flex</b>
                <small>He moved up 3 spots after Wednesday practice</small>
              </span>
              <span className="status-tag">Suggested</span>
              <Icon name="arrow" size={16} />
            </button>
            <button className="brief-row">
              <span className="brief-number">03</span>
              <span className="brief-copy">
                <b>Your synced lineup is fully active</b>
                <small>No injury designations among the listed starters</small>
              </span>
              <span className="status-tag clear">Clear</span>
              <Icon name="arrow" size={16} />
            </button>
          </div>
        </section>
        <MatchupSpotlight onOpen={onOpenStartSit} />
      </div>
    </main>
  )
}

function RankingsPage() {
  return (
    <main className="page-shell rankings-page">
      <section className="welcome">
        <div>
          <span className="eyebrow">Week 4 · Consensus</span>
          <h1>Player rankings</h1>
          <p>
            Expert consensus adjusted for scoring format and weekly matchup.
          </p>
        </div>
        <div className="week-control">
          <span>Scoring</span>
          <button>
            Half-PPR <Icon name="chevron" size={15} />
          </button>
        </div>
      </section>
      <div className="rankings-context">
        <span>
          <b>238</b> ranked players
        </span>
        <span>
          Last updated <b>12 min ago</b>
        </span>
        <span>
          Sources <b>42 experts</b>
        </span>
      </div>
      <Rankings />
    </main>
  )
}

const lineup = [
  { slot: "QB", player: "Josh Allen", team: "BUF", opponent: "@ BAL", projection: "23.4", color: "#2f67b1" },
  { slot: "RB", player: "Bijan Robinson", team: "ATL", opponent: "vs TB", projection: "19.8", color: "#c8493b" },
  { slot: "RB", player: "Breece Hall", team: "NYJ", opponent: "@ DEN", projection: "17.6", color: "#2c8053" },
  { slot: "WR", player: "Ja'Marr Chase", team: "CIN", opponent: "@ CLE", projection: "18.2", color: "#c8732a" },
  { slot: "WR", player: "Puka Nacua", team: "LAR", opponent: "vs SF", projection: "17.7", color: "#315d9b" },
  { slot: "FLEX", player: "Amon-Ra St. Brown", team: "DET", opponent: "vs KC", projection: "16.8", color: "#287aaa" },
]

function MyTeam() {
  return (
    <main className="page-shell team-page">
      <section className="team-header">
        <div className="team-identity">
          <span className="team-logo">GH</span>
          <div>
            <span className="eyebrow">Josh's team</span>
            <h1>Ghost Hunters</h1>
            <p>Synced from your league · 3–0 · 1st place</p>
          </div>
        </div>
        <button className="secondary-button">Refresh league data</button>
      </section>
      <div className="team-layout">
        <section className="panel lineup-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Recommended lineup</span>
              <h2>Week 4 recommendation</h2>
            </div>
            <span className="lineup-total">
              <small>Projected</small>
              <b>126.4</b>
            </span>
          </div>
          <div className="lineup-list">
            {lineup.map((item) => (
              <button className="lineup-row" key={`${item.slot}-${item.player}`}>
                <span className="slot-label">{item.slot}</span>
                <PlayerMark
                  player={{
                    ...players[0],
                    name: item.player,
                    team: item.team,
                    opponent: item.opponent,
                    projection: Number(item.projection),
                    color: item.color,
                  }}
                />
                <span className="player-name">
                  <b>{item.player}</b>
                  <small>
                    {item.team} · {item.opponent}
                  </small>
                </span>
                <span className="roster-status">
                  <i /> Active
                </span>
                <span className="lineup-projection">
                  <b>{item.projection}</b>
                  <small>proj</small>
                </span>
                <Icon name="arrow" size={16} />
              </button>
            ))}
          </div>
        </section>
        <aside className="team-sidebar">
          <section className="panel matchup-card">
            <span className="eyebrow">Week 4 matchup</span>
            <div className="score-preview">
              <div><span>GH</span><b>126.4</b><small>Ghost Hunters</small></div>
              <em>vs</em>
              <div><span>SC</span><b>119.2</b><small>Sunday Club</small></div>
            </div>
            <div className="win-bar"><span /></div>
            <p><b>64%</b> projected win probability</p>
          </section>
          <section className="panel roster-note">
            <Icon name="activity" />
            <div>
              <b>Companion mode</b>
              <p>Apply lineup changes in your league platform.</p>
            </div>
          </section>
        </aside>
      </div>
    </main>
  )
}

function SelectBox({ label, value }: { label: string value: string }) {
  return (
    <button className="select-box">
      <span>{label}</span>
      <b>{value}</b>
      <Icon name="chevron" size={15} />
    </button>
  )
}

function ComparisonCard({
  player,
  recommended = false,
}: {
  player: typeof players[number]
  recommended?: boolean
}) {
  return (
    <article className={`comparison-card ${recommended ? "recommended" : ""}`}>
      {recommended && (
        <span className="recommendation">
          <Icon name="sparkles" size={14} /> Recommended start
        </span>
      )}
      <div className="comparison-player">
        <PlayerMark large player={player} />
        <div>
          <h3>{player.name}</h3>
          <p>
            {player.position} · {player.team} <span>· {player.opponent}</span>
          </p>
        </div>
      </div>
      <div className="projection-block">
        <span>Projected points</span>
        <strong>{player.projection}</strong>
        <small>
          {recommended
            ? "17.4 floor · 23.1 ceiling"
            : "14.8 floor · 21.6 ceiling"}
        </small>
      </div>
      <div className="confidence-bar">
        <span style={{ width: recommended ? "82%" : "68%" }} />
      </div>
      <div className="stat-pair">
        <span>
          <small>Matchup rank</small>
          <b>{recommended ? "4th" : "15th"}</b>
        </span>
        <span>
          <small>Defense vs RB</small>
          <b className={recommended ? "positive" : "negative"}>
            {recommended ? "+2.8" : "-1.4"}
          </b>
        </span>
        <span>
          <small>Expert start</small>
          <b>{recommended ? "84%" : "62%"}</b>
        </span>
      </div>
      <div className="factors">
        <span className={recommended ? "good" : "bad"}>
          {recommended ? "Home favorite" : "Road matchup"}
        </span>
        <span className={recommended ? "good" : "neutral"}>
          {recommended ? "High red-zone share" : "Strong volume"}
        </span>
      </div>
    </article>
  )
}

function StartSit() {
  const breece = {
    ...players[1],
    name: "Breece Hall",
    team: "NYJ",
    opponent: "@ DEN",
    projection: 17.6,
    color: "#2c8053",
  }
  return (
    <main className="page-shell start-sit-page">
      <section className="welcome">
        <div>
          <span className="eyebrow">Decision tool</span>
          <h1>Who should you start?</h1>
          <p>
            Compare projections, opportunity, and matchup—not just a single
            number.
          </p>
        </div>
      </section>
      <section className="comparison-controls panel">
        <SelectBox label="Week" value="Week 4" />
        <SelectBox label="Scoring" value="Half-PPR" />
        <SelectBox label="TE premium" value="0.0" />
        <div className="selected-player">
          <PlayerMark player={players[0]} />
          <span>
            <small>Player one</small>
            <b>Bijan Robinson</b>
          </span>
        </div>
        <button aria-label="Swap players" className="swap-button">
          <Icon name="swap" />
        </button>
        <div className="selected-player">
          <PlayerMark player={breece} />
          <span>
            <small>Player two</small>
            <b>Breece Hall</b>
          </span>
        </div>
        <button className="primary-button">Compare</button>
      </section>
      <section className="decision-banner">
        <span className="decision-icon">
          <Icon name="sparkles" />
        </span>
        <div>
          <span>Ghost recommendation</span>
          <strong>Start Bijan Robinson</strong>
          <p>
            Higher touchdown equity and the stronger offensive environment give
            him a <b>2.2 point edge.</b>
          </p>
        </div>
        <span className="confidence">82% confidence</span>
      </section>
      <div className="comparison-grid">
        <ComparisonCard player={players[0]} recommended />
        <ComparisonCard player={breece} />
      </div>
      <p className="method-note">
        Projections combine expert consensus, implied team totals, usage trends,
        and matchup-adjusted scoring. Updated 12 minutes ago.
      </p>
    </main>
  )
}

export default function App() {
  const [active, setActive] = useState("Home")
  const pages: Record<string, ReactNode> = {
    Home: <Home onOpenStartSit={() => setActive("Start / Sit")} />,
    Rankings: <RankingsPage />,
    "Start / Sit": <StartSit />,
    "My Team": <MyTeam />,
  }
  return (
    <div className="app">
      <Header active={active} onNavigate={setActive} />
      {pages[active]}
      <MobileNav active={active} onNavigate={setActive} />
    </div>
  )
}
