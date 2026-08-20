/**
 * The word corpus.
 *
 * CURATION IS THE PRODUCT. Every competing random word generator runs on a
 * scraped dictionary, which is why they hand you "abaptiston" and "zygodactyl"
 * — technically words, useless for the things people actually came to do. Every
 * word below was chosen by hand against four rules:
 *
 *   1. A native speaker knows it without looking it up.
 *   2. It can be spelled from hearing it, which matters for passphrases.
 *   3. It is safe to put in front of a classroom.
 *   4. It earns its slot for at least one of the tool's uses — a noun you can
 *      draw, a verb you can act out, an adjective that pushes a sentence.
 *
 * Lists are grouped by what they are FOR, not by part of speech alone: the game
 * modes need words you can draw or mime, and that is a property of the word's
 * meaning, not its grammar. `CONCRETE_NOUNS` is therefore things you could
 * photograph, while `ABSTRACT_NOUNS` is kept apart and used only where an idea
 * is wanted (writing prompts), never where a picture is.
 *
 * Words are stored space-separated and split at load: it keeps the source
 * reviewable in a diff and the bundle a third of the size of a JSON array of
 * quoted strings.
 *
 * INVARIANTS, enforced by corpus.test.ts: lowercase a-z only, at least three
 * letters, and no word appearing twice anywhere in the corpus. The last one is
 * not cosmetic — a duplicate silently doubles that word's odds and quietly
 * corrupts the entropy figure the passphrase mode reports.
 */

/** Split a whitespace-formatted word block. Formatting is free; content is not. */
function w(block: string): readonly string[] {
  return block.trim().split(/\s+/);
}

const ANIMALS = w(`
  ant ape badger bat bear beaver bee beetle bison buffalo bull butterfly calf
  camel cat caterpillar chicken chimp clam cobra cow coyote crab crane crocodile
  crow deer dolphin donkey dove dragonfly duck eagle elephant elk falcon ferret
  finch firefly flamingo fox frog gecko giraffe goat goose gorilla grasshopper
  hamster hawk hedgehog hen heron hippo horse hound jaguar jellyfish kangaroo
  kitten koala ladybug lamb leopard lion lizard llama lobster magpie mole
  mongoose monkey moose mosquito moth mule newt octopus ostrich otter owl panda
  panther parrot peacock pelican penguin pigeon pony porcupine puppy rabbit
  raccoon raven reindeer rhino robin rooster salmon scorpion shark sheep shrimp
  skunk sloth snail snake sparrow spider squid squirrel starfish stork swan
  tiger toad tortoise trout turkey turtle walrus wasp weasel whale wolf wombat
  woodpecker worm zebra
`);

const FOOD = w(`
  apple apricot avocado bacon bagel banana basil bean biscuit blueberry bread
  broccoli butter cabbage cake candy carrot cashew celery cereal cheese cherry
  chocolate cinnamon coconut cookie cracker cream cucumber cupcake curry custard
  dumpling flour garlic ginger grape gravy honey jam juice ketchup kiwi lemon
  lentil lettuce lime mango maple melon milk mint muffin mushroom mustard noodle
  nutmeg oatmeal olive onion orange pancake papaya pasta pastry peach peanut
  pear pepper pickle pineapple pizza plum popcorn potato pretzel pudding pumpkin
  radish raisin rice salad salsa sandwich sauce sausage sesame soup spinach stew
  strawberry sugar syrup taco toast tomato tortilla vanilla vinegar waffle
  walnut watermelon wheat yogurt zucchini
`);

const HOUSEHOLD = w(`
  album apron armchair backpack badge bandage banner barrel basin basket bathtub
  battery blanket blender bolt book bookcase boot bottle bowl bracelet brick
  broom brush bucket button cabinet cage candle cane canvas cape carpet cassette
  chain chair chalk clip clock closet cloth coaster coin comb compass cord cork
  couch crate cradle crayon crown curtain cushion diary dish doll drawer dresser
  dustpan easel envelope eraser faucet fence folder fork frame funnel furnace
  glue goggles hammer hammock hanger hinge hook hose jar jug kettle keyboard
  knife knob ladder lamp lantern laptop latch leash lever locker magnet mailbox
  marble marker mat mattress medal mirror mop mug napkin necklace needle
  notebook oven paddle padlock pan pencil pillow pipe plate plug poster pouch
  puppet purse puzzle quilt rake razor ribbon rope rug saddle sandal saucer scale
  scissors screw screwdriver shampoo shelf shovel sink sled soap sofa spatula
  sponge spoon stamp stapler stool stove straw suitcase switch table tablet tape
  teapot telescope tent thimble thread throne ticket tile toaster toothbrush
  torch towel tray tripod trophy tub tube typewriter umbrella vase wallet
  wardrobe watch whistle wire wrench yarn zipper
`);

const CLOTHING = w(`
  belt blouse cap coat dress glove hat helmet jacket jeans mitten pajamas pocket
  robe scarf shirt shoe skirt sleeve slipper sock sweater tie
  trousers uniform vest wig
`);

const NATURE = w(`
  acorn autumn bay beach blossom boulder branch breeze brook bush canyon cave
  cliff cloud coast comet coral creek crystal dawn desert dune dusk eclipse fern
  field flame flood flower forest fountain frost galaxy garden glacier grass
  grove hail hill iceberg island jungle lagoon lake lava leaf lightning marsh
  meadow mist moon moss mountain mud nest ocean orchard pebble petal planet pond
  prairie rainbow reef river root sand seashell seed shore sky smoke snow soil
  star stone storm stream sunset swamp thunder tide trail tree tundra valley
  volcano waterfall wave willow
`);

const PLACES = w(`
  airport alley apartment arena attic bakery balcony bank barn basement bridge
  cabin cafe castle cathedral cellar chapel cinema classroom clinic college
  corridor cottage courtyard dock factory farm fortress gallery garage
  greenhouse harbor hospital hotel hut kitchen library lighthouse lobby market
  mill monastery museum office palace park pharmacy pier playground plaza prison
  pyramid restaurant roof school shed sidewalk stadium station studio temple
  theater tower tunnel village warehouse workshop
`);

const BODY = w(`
  ankle beard bone brain cheek chin elbow eyebrow fingernail fist freckle heel
  jaw knee knuckle lung muscle shoulder skull spine stomach thumb tongue tooth
  wrist
`);

const VEHICLES = w(`
  airplane ambulance barge bicycle boat bulldozer bus canoe caravan cart ferry glider helicopter jeep kayak motorcycle parachute raft
  rocket sailboat scooter ship skateboard sleigh submarine subway taxi tractor
  trailer train tram truck wagon wheelbarrow yacht
`);

const MUSIC_ART_SPORT = w(`
  accordion anthem archery ballet banjo baseball basketball bowling boxing cello
  chess choir circus clarinet cymbal drum fiddle flute football golf guitar
  gymnastics harmonica harp hockey javelin karate marathon mural orchestra organ
  piano poem pottery racket rugby sculpture skateboarding sketch soccer song
  surfboard tambourine tennis trombone trumpet tuba violin volleyball xylophone
`);

const PEOPLE = w(`
  acrobat actor architect artist astronaut athlete author baker banker barber
  blacksmith butcher captain carpenter chef chemist clown dancer dentist
  detective doctor driver editor engineer explorer farmer firefighter florist
  gardener guard guide hunter janitor jeweler journalist judge juggler knight
  lawyer librarian lifeguard magician mayor mechanic miner musician nurse
  painter pharmacist photographer pilot pirate plumber poet professor sailor
  scientist sculptor shepherd singer soldier surgeon tailor teacher tourist
  waiter writer
`);

const MISC_THINGS = w(`
  anchor balloon bell bubble calendar camera candlestick chimney coffin
  confetti costume dice diploma domino feather flag fossil gift globe
  hourglass invoice kite label lens letter lightbulb machine magnifier mask
  medicine microphone microscope money newspaper package pamphlet parcel passport
  pearl pendulum periscope photograph postcard radar radio receipt
  recipe ring robot ruler satellite scarecrow scoreboard shield
  signature siren skeleton snowman souvenir spacesuit sparkler statue
  telephone thermometer timer treasure
  windmill
`);

/**
 * Things you could photograph — the pool for anything that must be drawn, mimed
 * or guessed. Deliberately excludes anything abstract: "justice" is a fine word
 * and an impossible Pictionary card.
 */
export const CONCRETE_NOUNS: readonly string[] = [
  ...ANIMALS, ...FOOD, ...HOUSEHOLD, ...CLOTHING, ...NATURE, ...PLACES,
  ...BODY, ...VEHICLES, ...MUSIC_ART_SPORT, ...PEOPLE, ...MISC_THINGS,
];

/**
 * Ideas, feelings and states. Used for writing prompts, where the friction
 * between an abstract noun and a concrete one is the whole point of the
 * exercise, and never for the drawing games.
 */
export const ABSTRACT_NOUNS: readonly string[] = w(`
  ability absence advantage adventure advice ambition anger answer apology
  argument attention balance beauty belief bravery chance change chaos
  charm childhood choice comfort compassion confidence courage crisis curiosity
  custom danger decision delight departure desire despair destiny dignity
  discipline distance doubt dream duty effort emotion energy envy escape
  excitement failure faith fame fate fear fortune freedom friendship future
  generosity genius glory gossip gratitude grief growth habit happiness harmony
  hatred history honesty honor hope humor hunger idea illusion imagination
  impulse instinct intention jealousy journey joy justice kindness knowledge
  laughter legend liberty logic loneliness longing loyalty luck luxury madness
  magic memory mercy method mischief mistake moment motive mystery nonsense
  nostalgia opinion opportunity order panic passion patience peace permission
  pity pleasure power pride principle privacy progress promise purpose
  reason regret relief reputation respect revenge rhythm riddle
  risk routine rumor sadness safety secret shame silence solitude sorrow speed
  strength stress success surprise suspicion sympathy talent temptation tension
  theory thought thrill tradition tragedy trouble trust truth urgency victory
  virtue warmth welcome wisdom wonder worry youth
`);

/**
 * Verbs you can act out. Charades is the hard constraint here: every one of
 * these can be mimed across a room, which rules out most of the verbs a
 * dictionary would hand you ("comprise", "entail", "pertain").
 */
export const ACTION_VERBS: readonly string[] = w(`
  bake bend bite blink blow bounce bow braid breathe build burn carry
  carve catch chase chew chop clap climb crawl crush cry cut dance dig dive
  dodge drag draw drink drip drive drop dust eat fall fetch fight
  flip float fly fold freeze frown gallop gather giggle glide grab grin grip
  hatch hide hike hop hug hum hunt hurry jog juggle jump kick kneel knit
  knock land laugh leap lean lick lift limp listen march measure melt mix
  nod paint pant peel pinch plant play point polish pounce
  pour press pull punch push race read reach ride rinse roll row rub run
  sail salute scatter scoop scratch scrub search sew shake share sharpen shave
  shiver shout shrug sing sip skate ski skip sleep slide slip
  smell smile sneeze sniff snore sort spill spin splash spray sprint squeeze
  stack stand stare steer stir stomp stretch stumble sweep swim swing tap
  taste tear throw tickle tiptoe tumble twirl twist type unlock unwrap wade wait
  wake walk wander wash weave whisper wink wipe wobble wrap wrestle
  write yawn zip
`);

/**
 * Adjectives with a picture in them. Chosen so that pairing one with a random
 * noun produces something a writer can use ("hollow lighthouse") rather than
 * grammatical noise ("various lighthouse").
 */
export const ADJECTIVES: readonly string[] = w(`
  ancient angry anxious awkward bitter blunt bold brave brief bright brittle
  broken bumpy calm careful cautious cheerful chilly clever clumsy cold
  colorful cosy cracked creaky crooked crowded cruel curious curly damp dark
  deep delicate desperate dizzy dusty eager early elegant empty endless faded
  faint fearless feeble fierce filthy flimsy fluffy foggy fond forgotten fragile
  fragrant frantic fresh frozen furious fuzzy gentle giant gigantic gleaming
  gloomy glossy golden graceful greasy greedy grim gritty grumpy hairy handsome
  harsh haunted hazy heavy hidden hollow honest hungry hurried icy idle jagged
  jolly joyful keen kind lazy lively lonely loose loud lucky lumpy majestic
  massive melted merry mighty misty modest moldy muddy narrow nervous nimble
  noisy odd oily patient peculiar plain playful polished precious prickly proud
  quiet ragged rapid rare restless ripe rotten rough round rowdy rusty salty
  scruffy shabby shaky shallow sharp shiny short shy silent silky silly
  sleepy slender slimy slippery slow smoky smooth soggy solemn sour sparkling
  spicy spiky spotless sticky stiff stormy strange stubborn sturdy sudden sunny
  swift tangled tender tense thirsty thorny tidy timid tiny tired tough
  transparent tricky twisted uneasy upright velvety violet warm weary weightless
  wet wicked wide wild windy winding wise wobbly wonderful wooden worried yellow
  young zesty
`);

/** Everything, for the modes that do not care what part of speech a word is. */
export const ALL_WORDS: readonly string[] = [
  ...CONCRETE_NOUNS, ...ABSTRACT_NOUNS, ...ACTION_VERBS, ...ADJECTIVES,
];
