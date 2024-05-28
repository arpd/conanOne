cmake_minimum_required(VERSION 3.2)
project(bar C CXX)

set(SOURCE_FILES
    bar.hh
    bar.cc
)

add_library(bar SHARED STATIC ${SOURCE_FILES})

install(TARGETS bar DESTINATION ${FOO_INSTALL_LIB_DIR})
install(FILES bar.hh DESTINATION ${BAR_INSTALL_INCLUDE_DIR})