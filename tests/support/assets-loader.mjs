export async function load(url, context, nextLoad) {
 if (/\.(glb|hdr|png|jpg|webp)(\?.*)?$/.test(url)) return {format:'module',source:'export default "test-asset";',shortCircuit:true};
 return nextLoad(url,context);
}
