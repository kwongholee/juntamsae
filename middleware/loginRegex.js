export default function isStudentId(v) {
  let regex = /^\d{10}$/;

  return regex.test(v);
}