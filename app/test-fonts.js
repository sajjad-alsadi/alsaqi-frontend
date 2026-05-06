async function test() {
  const res1 = await fetch('https://raw.githubusercontent.com/google/fonts/main/ofl/cairo/Cairo-Regular.ttf');
  console.log('Cairo:', res1.status);
  const res2 = await fetch('https://raw.githubusercontent.com/google/fonts/main/ofl/amiri/Amiri-Regular.ttf');
  console.log('Amiri:', res2.status);
  const res3 = await fetch('https://cdn.jsdelivr.net/gh/alif-type/amiri@main/fonts/ttf/Amiri-Regular.ttf');
  console.log('Amiri jsdelivr:', res3.status);
}
test();
