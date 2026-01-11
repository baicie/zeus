use napi_derive::napi;

#[napi]
pub fn sum(a: i32, b: i32) -> i32 {
  a + b
}

#[napi]
pub fn hello(name: String) -> String {
  format!("Hello, {}!", name)
}

#[napi(object)]
pub struct Person {
  pub name: String,
  pub age: u32,
}

#[napi]
pub fn create_person(name: String, age: u32) -> Person {
  Person { name, age }
}
