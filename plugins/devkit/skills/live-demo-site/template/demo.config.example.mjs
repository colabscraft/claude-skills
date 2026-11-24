// The PROJECT'S side of the live demo site (live-demo-site skill): copy to
// demo.config.mjs and fill in. player/build.mjs bundles it as
// `virtual:demo-config`; the player reads nothing project-specific from
// anywhere else. The skill's section 9 says where it came from.
import { makeApi } from './player/src/api.mjs';

const pad = (n) => String(n).padStart(2, '0');

export default {
  // --- the page -------------------------------------------------------------
  title: 'ศูนย์ฝึกอบรมการใช้งาน <ระบบ>', // the welcome card and the tab
  subtitle: '<หน่วยงาน> · ข้อมูลสมมติทั้งหมด',
  mark: 'brand/mark.svg', // the app's own mark, copied into the site
  photo: 'photo.jpg', // what setInputFiles attaches (a scene, never a real person)
  storeKey: 'demo', // localStorage prefix for the viewer's settings
  videoMode: false, // true when the site also carries video.html + recordings

  // --- the app in the frame -------------------------------------------------
  appPath: 'app/', // where the app is mounted on THIS origin
  signedOutPath: 'login', // a signed-out topic (signedOut: true) starts here
  landingPath: '', // a signed-in topic starts here (the app's own landing)
  desktopMin: 1280, // the width the scripts were written at: never narrower
  phone: { w: 412, h: 860 }, // a `device: 'phone'` topic's frame

  /** The API client the prerequisites and the sign-in use. makeApi's
   *  defaults suit an app with OIDC sign-in (the worked example's): override the paths, the CSRF
   *  pair and afterSignIn for another app, and add the app's own verbs. */
  api(appBase) {
    const api = makeApi(appBase, {
      // csrfCookie: 'csrftoken', csrfHeader: 'X-CSRFToken',
      // startPath: 'api/auth/oidc/start', sessionPath: 'api/auth/session', logoutPath: 'api/auth/logout',
      // afterSignIn: async (a, session) => { if (session.privacyNotice) await a.post('api/privacy-notice/acknowledge', { version: session.privacyNotice }); },
    });
    // api.command = (task, key) => api.post('api/tasks/executeCommand', { instanceId: task.id, commandKey: key });
    return api;
  },

  /** This run's OWN data, handed to the script as `t.trip`: a unique number,
   *  a random day, so two viewers (or two runs) never meet on one record. */
  newRun(feature) {
    const d = new Date(Date.now() + (7 + Math.floor(Math.random() * 49)) * 86_400_000);
    return { docNo: `DEMO-${100 + Math.floor(Math.random() * 9900)}`, day: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` };
  },

  /** Bring this run's data to what the topic starts from (`feature.needs`),
   *  over the API, under the seats each step belongs to - never by replaying
   *  the topics before it. `say` labels the "กำลังเตรียม..." cover. A topic that
   *  writes the SAME record every run needs a `needs` that clears it first. */
  async prepare(api, feature, run, { photo, say }) {
    switch (feature.needs) {
      // case 'submitted':
      //   say('สร้างรายการสำหรับหัวข้อนี้');
      //   await api.signIn('<seat label>');
      //   run.id = (await api.post('api/things', { no: run.docNo, day: run.day })).id;
      //   break;
      default:
        throw new Error(`no prerequisite "${feature.needs}" in demo.config.mjs`);
    }
  },

  /** Put the framed app the way every script expects it, whatever the viewer
   *  did in a hands-on tab (same origin, same storage): its LIGHT theme, its
   *  own layout. The keys are the app's own. */
  beforeRun() {
    try {
      // localStorage.setItem('<app theme key>', 'light');
    } catch { /* private mode */ }
  },
};
