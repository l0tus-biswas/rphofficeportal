import Quill from 'quill';
import { normalizeRichText } from '../services/carrier.service';

/**
 * Shared Quill config for the broadcast composers.
 *
 * Colours are stored as classes (ql-color-red, ql-bg-yellow, ...) instead of
 * inline styles because Angular's built-in [innerHTML] sanitizer strips style
 * attributes. The matching CSS lives in styles.css.
 */
export const BROADCAST_COLORS = ['black', 'gray', 'red', 'orange', 'gold', 'green', 'teal', 'blue', 'purple'];
export const BROADCAST_BACKGROUNDS = ['yellow', 'lightgreen', 'lightblue', 'pink', 'lightgray', 'orange'];

let registered = false;
function registerClassAttributors(): void {
  if (registered) return;
  registered = true;
  const Parchment: any = Quill.import('parchment');
  const color = new Parchment.ClassAttributor('color', 'ql-color', {
    scope: Parchment.Scope.INLINE,
    whitelist: BROADCAST_COLORS
  });
  const background = new Parchment.ClassAttributor('background', 'ql-bg', {
    scope: Parchment.Scope.INLINE,
    whitelist: BROADCAST_BACKGROUNDS
  });
  Quill.register(color, true);
  Quill.register(background, true);
}
registerClassAttributors();

// No 'image'/'video' button or format: images go through the attachment field,
// never as base64 inside the message HTML.
export const broadcastQuillModules = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ color: BROADCAST_COLORS }, { background: BROADCAST_BACKGROUNDS }],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['blockquote', 'link'],
    ['clean']
  ]
};

export const broadcastQuillFormats = [
  'header', 'bold', 'italic', 'underline', 'strike', 'color', 'background',
  'list', 'blockquote', 'link', 'indent'
];

/** Reads Quill's live DOM, drops list-marker spans and normalises bullet lists to <ul>. */
export const broadcastQuillValueGetter = (quillEditor: any): string =>
  normalizeRichText(
    String(quillEditor.root.innerHTML).replace(/<span class="ql-ui"[^>]*><\/span>/g, '')
  );
