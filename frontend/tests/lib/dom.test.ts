import { describe, expect, it } from 'vitest';

import { isEditableTarget } from '@/lib/dom';

describe('isEditableTarget', () => {
  it('recognises fields that own text input', () => {
    for (const tag of ['input', 'textarea', 'select']) {
      expect(isEditableTarget(document.createElement(tag))).toBe(true);
    }

    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    const child = document.createElement('span');
    editable.appendChild(child);

    expect(isEditableTarget(editable)).toBe(true);
    expect(isEditableTarget(child)).toBe(true);
  });

  it('rejects other targets', () => {
    expect(isEditableTarget(document.createElement('div'))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});
