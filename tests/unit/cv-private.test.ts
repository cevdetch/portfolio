import assert from 'node:assert/strict';
import { test } from 'node:test';
import { privateOverrides } from '../../scripts/cv-private.ts';

test('only set private fields become RenderCV overrides', () => {
  assert.deepEqual(privateOverrides({ CV_PHONE: '+41791234567', CV_LOCATION: '', CV_EDUCATION_LOCATION: 'City' }), [
    '--cv.phone', '+41791234567', '--cv.sections.education.0.location', 'City',
  ]);
  assert.deepEqual(privateOverrides({}), []);
});

test('the phone must be E.164', () => {
  assert.throws(() => privateOverrides({ CV_PHONE: '079 123 45 67' }), /E\.164/);
});
