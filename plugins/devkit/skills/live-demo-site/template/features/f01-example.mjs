// One topic = one file, fNN-name.mjs, in play order. The SAME file runs live in
// the viewer's browser (player/src/pw.mjs, a Playwright subset) and, if the
// project records videos, under real Playwright - so use only the subset the
// skill lists, and find things by ROLE and NAME, never by CSS position.
export default {
  group: 'เริ่มต้นใช้งาน', // the topics drawer groups by this
  title: 'เข้าสู่ระบบและเมนูบัญชีผู้ใช้',
  role: 'ผู้ใช้งานทั่วไป', // the seat label on the demo issuer's seat picker
  summary: 'เข้าสู่ระบบ ดูโปรไฟล์ของฉัน และออกจากระบบ',
  // device: 'phone',     // played in a phone frame
  // needs: 'submitted',  // demo.config.mjs prepare() brings this run's data there first
  // signedOut: true,     // starts on the app's sign-in page instead of signed in
  async run(t) {
    const p = t.page;
    // A step = a caption in the panel and a place the viewer can jump to.
    await t.step('หน้าแรกหลังเข้าสู่ระบบ', 'แต่ละบทบาทเห็นเมนูไม่เหมือนกัน');
    await t.point(p.locator('nav').first(), 2400); // a ring round it
    await t.step('เมนูบัญชีผู้ใช้ มุมขวาบน');
    const account = p.getByRole('button', { name: /บัญชี|สมมติ/ });
    await t.click(account); // cursor moves, real click, a beat after
    await t.note('เมนูนี้มีโปรไฟล์ เกี่ยวกับระบบ และออกจากระบบ'); // a yellow tip
    await t.click(p.getByRole('menuitem', { name: 'โปรไฟล์ของฉัน' }));
    await t.settle(); // the page and its requests at rest
    await t.expect(p.getByRole('heading', { name: 'โปรไฟล์ของฉัน' })).toBeVisible();
    await t.pause(2000); // a held moment, skipped in a quick re-run
    // t.trip is THIS run's own data (demo.config.mjs newRun / prepare):
    // await t.type(p.getByRole('textbox', { name: 'เลขที่เอกสาร' }), t.trip.docNo);
  },
};
