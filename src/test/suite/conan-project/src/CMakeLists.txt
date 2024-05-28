cmake_minimum_required(VERSION 3.2)
project(foo)

add_subdirectory(bar)
set(SOURCE_FILES main.cc)

add_executable(foo ${SOURCE_FILES})
target_link_libraries(foo bar)
install(TARGETS foo DESTINATION ${FOO_INSTALL_BIN_DIR})