import { Magika } from "magika";

async function run() {
  const magika = new Magika();
  await magika.load();
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG
  const res = await magika.identifyBytes(bytes);
  console.log(res);
}
run();
