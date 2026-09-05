import type {Book} from '../types/library';

export type {Book} from '../types/library';

export const books: Book[] = [
  {
    id: 'the-great-gatsby',
    title: 'The Great Gatsby',
    author: 'F. Scott Fitzgerald',
    genre: 'Classic Fiction',
    progress: 42,
    remaining: '2h 18m left',
    cover: {background: '#243A35', accent: '#D9A64A', mark: 'GG'},
    isSample: true,
  },
  {
    id: 'pride-and-prejudice',
    title: 'Pride and Prejudice',
    author: 'Jane Austen',
    genre: 'Romance',
    progress: 18,
    remaining: '7h 04m left',
    cover: {background: '#A85849', accent: '#F1D7B2', mark: 'P&P'},
    isSample: true,
  },
  {
    id: 'meditations',
    title: 'Meditations',
    author: 'Marcus Aurelius',
    genre: 'Philosophy',
    progress: 0,
    remaining: '4h 36m',
    cover: {background: '#536B63', accent: '#E9DED0', mark: 'M'},
    isSample: true,
  },
  {
    id: 'little-women',
    title: 'Little Women',
    author: 'Louisa May Alcott',
    genre: 'Classic Fiction',
    progress: 76,
    remaining: '3h 12m left',
    cover: {background: '#705A76', accent: '#F0D69D', mark: 'LW'},
    isSample: true,
  },
];

export const sampleChapter = [
  'In my younger and more vulnerable years my father gave me some advice that I’ve been turning over in my mind ever since.',
  '“Whenever you feel like criticizing anyone,” he told me, “just remember that all the people in this world haven’t had the advantages that you’ve had.”',
  'He didn’t say any more, but we’ve always been unusually communicative in a reserved way, and I understood that he meant a great deal more than that.',
  'In consequence, I’m inclined to reserve all judgments, a habit that has opened up many curious natures to me and also made me the victim of not a few veteran bores.',
];
