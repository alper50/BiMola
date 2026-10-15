// One BiMola character follows the player into every game. Games draw their own model
// (2D sprite, 3D figure…) and take only the palette and the accessory from here.
// Shared by the lobby, the game pages and the server, so it holds data only.
export const CHARACTERS = Object.freeze([
  {id: 'kartopu', name: 'Kartopu', body: '#f4f8ff', shade: '#c9d6ea', accent: '#e2463f', accessory: 'beanie'},
  {id: 'buzul', name: 'Buzul', body: '#5aa9f0', shade: '#3a7dc4', accent: '#ffd23f', accessory: 'scarf'},
  {id: 'gece', name: 'Gece', body: '#7d5cd6', shade: '#5a3fa8', accent: '#d8dde8', accessory: 'helmet'},
  {id: 'kivilcim', name: 'Kıvılcım', body: '#ff9a3c', shade: '#d9711c', accent: '#2b2f45', accessory: 'headphones'},
  {id: 'cam', name: 'Çam', body: '#4cc38a', shade: '#2f9466', accent: '#ffcf33', accessory: 'crown'},
  {id: 'lokum', name: 'Lokum', body: '#ff8fc2', shade: '#e0629e', accent: '#2b2f45', accessory: 'glasses'},
  {id: 'tarcin', name: 'Tarçın', body: '#c08552', shade: '#8f5c33', accent: '#2f6fd6', accessory: 'cap'},
  {id: 'limon', name: 'Limon', body: '#ffd84a', shade: '#e0b423', accent: '#e2463f', accessory: 'bow'},
  // Nesne Avı'ndan gelen dört karakter: o oyun tam kıyafetlerini çizer, diğerleri bu palet ve
  // aksesuarla. `trim` ikinci süs rengi, `beard` sakal rengidir.
  {id: 'levi', name: 'Levi', body: '#353b37', shade: '#24292a', accent: '#457b79', accessory: 'brimhat', beard: '#2b2622'},
  {id: 'marco', name: 'Marco', body: '#2e3646', shade: '#22293a', accent: '#f5f1e8', trim: '#b1a07a', accessory: 'collar'},
  {id: 'yusuf', name: 'Yusuf', body: '#efe4ce', shade: '#d5c6a6', accent: '#f5f1e8', trim: '#457b79', accessory: 'takke', beard: '#2b2622'},
  {id: 'tenzin', name: 'Tenzin', body: '#f5a947', shade: '#c1805e', accent: '#a8452c', trim: '#457b79', accessory: 'sash'},
].map(Object.freeze));
export const DEFAULT_CHARACTER = CHARACTERS[0].id;
export const validCharacter = id => typeof id === 'string' && CHARACTERS.some(c => c.id === id);
export const characterFor = id => CHARACTERS.find(c => c.id === id) || CHARACTERS[0];
// Bots and old clients get a valid character too.
export const randomCharacter = (random = Math.random) => CHARACTERS[Math.floor(random() * CHARACTERS.length)].id;
