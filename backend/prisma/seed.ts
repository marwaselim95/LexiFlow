// Seed: reference data from supabase/migrations 002 (phonemes) and 009 (languages)
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SUPPORTED_LANGUAGES: Array<[string, string]> = [
  ['ar', 'Arabic'],
  ['zh', 'Chinese'],
  ['nl', 'Dutch'],
  ['en', 'English'],
  ['fr', 'French'],
  ['de', 'German'],
  ['el', 'Greek'],
  ['he', 'Hebrew'],
  ['hi', 'Hindi'],
  ['id', 'Indonesian'],
  ['it', 'Italian'],
  ['ja', 'Japanese'],
  ['ko', 'Korean'],
  ['fa', 'Persian'],
  ['pl', 'Polish'],
  ['pt', 'Portuguese'],
  ['ro', 'Romanian'],
  ['ru', 'Russian'],
  ['es', 'Spanish'],
  ['sv', 'Swedish'],
  ['th', 'Thai'],
  ['tr', 'Turkish'],
  ['uk', 'Ukrainian'],
  ['vi', 'Vietnamese'],
];

const EN_PHONEMES: Array<[string, string]> = [
  // Vowels
  ['iː', 'Long EE (see)'],
  ['ɪ', 'Short I (bit)'],
  ['e', 'Short E (bed)'],
  ['æ', 'Short A (cat)'],
  ['ɑː', 'Long A (father)'],
  ['ɒ', 'Short O (hot)'],
  ['ɔː', 'Long AW (law)'],
  ['ʊ', 'Short U (book)'],
  ['uː', 'Long OO (food)'],
  ['ʌ', 'Short U (cup)'],
  ['ɜː', 'ER (bird)'],
  ['ə', 'Schwa (about)'],
  // Diphthongs
  ['eɪ', 'AY (day)'],
  ['aɪ', 'I (my)'],
  ['ɔɪ', 'OY (boy)'],
  ['əʊ', 'OH (go)'],
  ['aʊ', 'OW (now)'],
  ['ɪə', 'EAR (ear)'],
  ['eə', 'AIR (hair)'],
  ['ʊə', 'URE (cure)'],
  // Consonants
  ['p', 'P (pen)'],
  ['b', 'B (bed)'],
  ['t', 'T (ten)'],
  ['d', 'D (dog)'],
  ['k', 'K (cat)'],
  ['g', 'G (get)'],
  ['f', 'F (fat)'],
  ['v', 'V (van)'],
  ['θ', 'TH unvoiced (think)'],
  ['ð', 'TH voiced (this)'],
  ['s', 'S (sun)'],
  ['z', 'Z (zoo)'],
  ['ʃ', 'SH (ship)'],
  ['ʒ', 'ZH (measure)'],
  ['h', 'H (hat)'],
  ['tʃ', 'CH (chip)'],
  ['dʒ', 'J (judge)'],
  ['m', 'M (man)'],
  ['n', 'N (no)'],
  ['ŋ', 'NG (sing)'],
  ['l', 'L (leg)'],
  ['r', 'R (red)'],
  ['j', 'Y (yes)'],
  ['w', 'W (wet)'],
];

const FR_PHONEMES: Array<[string, string]> = [
  ['i', 'I (fille)'],
  ['e', 'É (été)'],
  ['ɛ', 'È (fête)'],
  ['a', 'A (patte)'],
  ['ɑ', 'Â (pâte)'],
  ['ɔ', 'O ouvert (or)'],
  ['o', 'O fermé (eau)'],
  ['u', 'OU (ou)'],
  ['y', 'U (tu)'],
  ['ø', 'EU fermé (feu)'],
  ['œ', 'EU ouvert (peur)'],
  ['ə', 'E caduc (le)'],
  ['ɛ̃', 'IN (fin)'],
  ['ɑ̃', 'AN (dans)'],
  ['ɔ̃', 'ON (bon)'],
  ['œ̃', 'UN (brun)'],
  ['j', 'Y (yeux)'],
  ['w', 'OI (oui)'],
  ['ɥ', 'UI (nuit)'],
  ['p', 'P (père)'],
  ['b', 'B (beau)'],
  ['t', 'T (table)'],
  ['d', 'D (dos)'],
  ['k', 'K (café)'],
  ['g', 'G (gare)'],
  ['f', 'F (feu)'],
  ['v', 'V (vin)'],
  ['s', 'S (sol)'],
  ['z', 'Z (zéro)'],
  ['ʃ', 'CH (chat)'],
  ['ʒ', 'J (jour)'],
  ['m', 'M (mer)'],
  ['n', 'N (nez)'],
  ['ɲ', 'GN (agneau)'],
  ['ŋ', 'NG (camping)'],
  ['l', 'L (lune)'],
  ['r', 'R (rue)'],
];

const EN_EXAMPLES: Array<[string, string]> = [
  ['iː', 'see'], ['ɪ', 'bit'], ['e', 'bed'], ['æ', 'cat'], ['ɑː', 'father'],
  ['ɒ', 'hot'], ['ɔː', 'law'], ['ʊ', 'book'], ['uː', 'food'], ['ʌ', 'cup'],
  ['ɜː', 'bird'], ['ə', 'about'], ['eɪ', 'day'], ['aɪ', 'my'], ['ɔɪ', 'boy'],
  ['əʊ', 'go'], ['aʊ', 'now'], ['ɪə', 'ear'], ['eə', 'hair'], ['ʊə', 'cure'],
  ['p', 'pen'], ['b', 'bed'], ['t', 'ten'], ['d', 'dog'], ['k', 'cat'],
  ['g', 'get'], ['f', 'fat'], ['v', 'van'], ['θ', 'think'], ['ð', 'this'],
  ['s', 'sun'], ['z', 'zoo'], ['ʃ', 'ship'], ['ʒ', 'measure'], ['h', 'hat'],
  ['tʃ', 'chip'], ['dʒ', 'judge'], ['m', 'man'], ['n', 'no'], ['ŋ', 'sing'],
  ['l', 'leg'], ['r', 'red'], ['j', 'yes'], ['w', 'wet'],
];

const FR_EXAMPLES: Array<[string, string]> = [
  ['i', 'fille'], ['e', 'été'], ['ɛ', 'fête'], ['a', 'patte'], ['ɑ', 'pâte'],
  ['ɔ', 'or'], ['o', 'eau'], ['u', 'ou'], ['y', 'tu'], ['ø', 'feu'],
  ['œ', 'peur'], ['ə', 'le'], ['ɛ̃', 'fin'], ['ɑ̃', 'dans'], ['ɔ̃', 'bon'],
  ['œ̃', 'brun'], ['j', 'yeux'], ['w', 'oui'], ['ɥ', 'nuit'],
  ['p', 'père'], ['b', 'beau'], ['t', 'table'], ['d', 'dos'], ['k', 'café'],
  ['g', 'gare'], ['f', 'feu'], ['v', 'vin'], ['s', 'sol'], ['z', 'zéro'],
  ['ʃ', 'chat'], ['ʒ', 'jour'], ['m', 'mer'], ['n', 'nez'], ['ɲ', 'agneau'],
  ['ŋ', 'camping'], ['l', 'lune'], ['r', 'rue'],
];

async function main() {
  for (const [code, name] of SUPPORTED_LANGUAGES) {
    await prisma.supportedLanguage.upsert({
      where: { code },
      update: { name },
      create: { code, name },
    });
  }

  for (const [phoneme, label] of EN_PHONEMES) {
    await prisma.phonemeReference.upsert({
      where: { language_phoneme: { language: 'en', phoneme } },
      update: { label },
      create: { language: 'en', phoneme, label },
    });
  }
  for (const [phoneme, label] of FR_PHONEMES) {
    await prisma.phonemeReference.upsert({
      where: { language_phoneme: { language: 'fr', phoneme } },
      update: { label },
      create: { language: 'fr', phoneme, label },
    });
  }

  for (const [phoneme, word] of EN_EXAMPLES) {
    await prisma.phonemeExampleWord.upsert({
      where: { language_phoneme: { language: 'en', phoneme } },
      update: { word },
      create: { language: 'en', phoneme, word },
    });
  }
  for (const [phoneme, word] of FR_EXAMPLES) {
    await prisma.phonemeExampleWord.upsert({
      where: { language_phoneme: { language: 'fr', phoneme } },
      update: { word },
      create: { language: 'fr', phoneme, word },
    });
  }

  console.log('Seed complete: languages, phoneme references, example words.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
