/**
 * One small, correct example per common diagram type.
 *
 * Nobody remembers whether a sequence arrow is `->>` or `-->>`, or how an ER
 * relationship is spelled, and the reference is a different tab. Each starter
 * shows the handful of forms that type is mostly written with, so editing it
 * teaches the syntax. Kept short enough to read at a glance; starters.test.ts
 * parses every one with Mermaid, so none can ship broken.
 */

export const STARTER_IDS = [
  'flowchart',
  'sequence',
  'class',
  'state',
  'er',
  'gantt',
  'pie',
  'mindmap',
  'timeline',
] as const;

export type StarterId = (typeof STARTER_IDS)[number];

export const STARTERS: Record<StarterId, string> = {
  flowchart: `flowchart TD
  start([Order placed]) --> pay{Payment OK?}
  pay -->|yes| pack[Pack the order]
  pay -->|no| retry[Ask for another card]
  retry --> pay
  pack --> ship[(Shipping queue)]
  ship --> done([Delivered])
`,
  sequence: `sequenceDiagram
  autonumber
  actor User
  participant App
  participant API
  User->>App: Tap "Sign in"
  App->>API: POST /session
  alt valid password
    API-->>App: 200 + token
    App-->>User: Welcome back
  else wrong password
    API-->>App: 401
    App-->>User: Try again
  end
`,
  class: `classDiagram
  class Order {
    +String id
    +Date placedAt
    +total() Money
  }
  class LineItem {
    +int quantity
    +Money price
  }
  class Customer {
    +String email
  }
  Customer "1" --> "*" Order : places
  Order "1" *-- "1..*" LineItem : contains
`,
  state: `stateDiagram-v2
  [*] --> Draft
  Draft --> Review : submit
  Review --> Draft : request changes
  Review --> Published : approve
  Published --> Archived : retire
  Archived --> [*]
`,
  er: `erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ LINE_ITEM : contains
  PRODUCT ||--o{ LINE_ITEM : "appears in"
  CUSTOMER {
    string email PK
    string name
  }
  ORDER {
    int id PK
    date placed_at
  }
`,
  gantt: `gantt
  title Website relaunch
  dateFormat YYYY-MM-DD
  section Design
    Wireframes      :done,   w, 2026-10-01, 5d
    Visual design   :active, v, after w, 7d
  section Build
    Front end       :f, after v, 10d
    Content         :c, after w, 12d
  section Launch
    Go live         :milestone, after f, 0d
`,
  pie: `pie title Where the week went
  "Meetings" : 12
  "Deep work" : 18
  "Email" : 6
  "Support" : 4
`,
  mindmap: `mindmap
  root((Trip to Lisbon))
    Book
      Flights
      Hotel
    Pack
      Adapter
      Sunscreen
    See
      Alfama
      Belém
`,
  timeline: `timeline
  title Product history
  2024 : Idea : First prototype
  2025 : Private beta
       : 500 users
  2026 : Public launch
`,
};
