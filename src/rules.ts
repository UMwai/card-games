export const RULES = {
  shengji: {
    title: "Sheng Ji · 升级",
    subtitle: "House rules v1 · two 54-card decks",
    sections: [
      {
        heading: "The deck & deal",
        body: "Combine two complete decks. Each deck has one small and one big joker: 108 cards and four jokers total. Deal 25 cards to each player; the dealer takes the 8-card bottom, then buries any 8 cards."
      },
      {
        heading: "The aim",
        body: "Partners sit opposite. The dealer’s team protects the points; defenders try to capture 5s, 10s, and Kings. Defenders need 80 points to take over the deal."
      },
      {
        heading: "Trump & the bottom",
        body: "The dealer’s current level is trump in every suit. One suit is also declared trump. The dealer takes the 8-card bottom and buries any 8 cards before leading."
      },
      {
        heading: "Playing a trick",
        body: "Lead a single, an exact pair, or a tractor (two or more consecutive pairs). Follow with the same number of cards. You must exhaust the led suit and must follow pairs or tractors when you can."
      },
      {
        heading: "Scoring",
        body: "The highest matching shape in the led suit wins unless trump ruffs it. If defenders win the final trick, points buried in the bottom are multiplied: ×2 for a single, ×4 for a pair, and more for longer tractors."
      }
    ]
  },
  guandan: {
    title: "Guan Dan · 掼蛋",
    subtitle: "House rules v1 · partnership climbing",
    sections: [
      {
        heading: "The aim",
        body: "Partners sit opposite. Shed all 27 cards before the other team. Your team advances 3 levels for a 1–2 finish, 2 for 1–3, and 1 for 1–4."
      },
      {
        heading: "Turn rhythm",
        body: "Lead any valid combination. In turn, beat it with the same type and size, play a bomb, or pass. When everyone else passes, the table clears and the last player leads again."
      },
      {
        heading: "Combinations",
        body: "Singles, pairs, triples, full houses, five-card straights, three consecutive pairs, two consecutive triples, straight flushes, same-rank bombs of four or more, and the four-joker bomb. Jokers cannot be added to a same-rank bomb; their only bomb is all four jokers together."
      },
      {
        heading: "Level & wild cards",
        body: "The active level ranks above Ace and below the jokers. Only the two heart cards of the active level are wild, and they cannot represent jokers. A straight flush beats every five-card bomb, loses to every six-card-or-larger bomb, and the four-joker bomb is highest."
      }
    ]
  }
} as const;
