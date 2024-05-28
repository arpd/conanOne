from conans import ConanFile, CMake

class ConanProject(ConanFile):
    exports_sources = "src*", "CMakeLists.txt"
    name = "foobar"
    version = "0.1"
    settings = "os", "compiler", "build_type", "arch"
    requires = ""
    generators = "cmake", "gcc", "txt"

    def build(self):
        cmake = CMake(self)
        cmake.configure()
        cmake.build()

    def package(self):
        cmake = CMake(self)
        cmake.configure()
        cmake.install()
        self.copy("*.hh", "include", "include")
        self.copy("foo", "bin", "bin")
        self.copy("libbar.a", "lib", "lib")

    def package_info(self):
        self.cpp_info.libs = ["libbar.a"]