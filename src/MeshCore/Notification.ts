
function tryNotify(title: string, options: object) {

}

function notifyMe() {
  if (!('Notification' in window)) return;

  if (Notification.permission === 'granted') {
    // Check whether notification permissions have already been granted;
    // if so, create a notification
    const notification = new Notification('Hi there!');
    // …
  } else if (Notification.permission !== 'denied') {
    // We need to ask the user for permission
    Notification.requestPermission().then((permission) => {
      // If the user accepts, let's create a notification
      if (permission === 'granted') {
        const notification = new Notification('Hi there!');
        // …
      }
    });
  }

  // At last, if the user has denied notifications, and you
  // want to be respectful there is no need to bother them anymore.
}